import ast
import json
import os
from pathlib import Path
import contextlib
import subprocess
import unittest
from unittest.mock import patch

from lens_release_readiness import (
    BOOL_FIELDS, COUNT_FIELDS, NGINX_HELPER, NODE_PROGRAM, parse_readiness,
    remote_program, run_release_readiness,
)
from lens_safe_ops import SafeFailure


class ReadinessSchemaTests(unittest.TestCase):
    def test_node_child_uses_the_discovered_existing_daemon(self):
        tree = ast.parse(remote_program())
        launches = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute) and node.func.attr == 'run']
        self.assertEqual(len(launches), 1)
        environments = [item.value for item in launches[0].keywords if item.arg == 'env']
        self.assertEqual(len(environments), 1, 'discovered_pm2_home_not_propagated')
        expression = ast.Expression(body=environments[0])
        rpc = Path('/synthetic/lens-daemon/rpc.sock')
        value = eval(compile(ast.fix_missing_locations(expression), '<synthetic-env>', 'eval'),
                     {'os': os, 'rpc': rpc})
        self.assertEqual(value['PM2_HOME'], str(rpc.parent))
        self.assertEqual(set(value) - {'PM2_HOME'}, set(os.environ) - {'PM2_HOME'})

    def payload(self):
        return {**{key: False for key in BOOL_FIELDS},
                **{key: 0 for key in COUNT_FIELDS}}

    def test_exact_closed_schema(self):
        value = self.payload()
        self.assertEqual(parse_readiness(json.dumps(value).encode()), value)

    def test_unknown_fields_are_rejected(self):
        value = {**self.payload(), 'unexpected': 'synthetic-private-value'}
        with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
            parse_readiness(json.dumps(value).encode())

    def test_missing_fields_are_rejected(self):
        value = self.payload()
        del value[next(iter(BOOL_FIELDS))]
        with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
            parse_readiness(json.dumps(value).encode())

    def test_boolean_is_not_a_count(self):
        value = self.payload()
        value[next(iter(COUNT_FIELDS))] = True
        with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
            parse_readiness(json.dumps(value).encode())

    def test_number_is_not_a_boolean(self):
        value = self.payload()
        value[next(iter(BOOL_FIELDS))] = 1
        with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
            parse_readiness(json.dumps(value).encode())

    def test_count_is_bounded(self):
        for invalid in (-1, 100001, 1.5, '4'):
            value = self.payload()
            value[next(iter(COUNT_FIELDS))] = invalid
            with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
                parse_readiness(json.dumps(value).encode())

    def test_non_object_and_malformed_json_are_rejected(self):
        for payload in (b'[]', b'null', b'invalid synthetic input', b'\xff'):
            with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
                parse_readiness(payload)

    def test_duplicate_fields_are_rejected(self):
        payload = json.dumps(self.payload())
        key = next(iter(BOOL_FIELDS))
        payload = payload[:-1] + ',"' + key + '":true}'
        with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
            parse_readiness(payload.encode())

    def test_oversized_payload_is_rejected_without_echo(self):
        with self.assertRaisesRegex(ValueError, '^invalid_readiness$'):
            parse_readiness(b'synthetic-private-value' * 1000)

    def test_remote_python_and_node_programs_parse(self):
        compile(remote_program(), '<synthetic-probe>', 'exec')
        child = subprocess.run(['node', '--check'], input=NODE_PROGRAM,
                               text=True, capture_output=True)
        self.assertEqual(child.returncode, 0)


class Channel:
    def __init__(self, payload, stderr=False, exit_code=0):
        self.payload = payload
        self.stderr = stderr
        self.exit_code = exit_code

    def recv_ready(self):
        return bool(self.payload)

    def recv(self, size):
        value, self.payload = self.payload[:size], self.payload[size:]
        return value

    def recv_stderr_ready(self):
        return self.stderr

    def exit_status_ready(self):
        return True

    def recv_exit_status(self):
        return self.exit_code


class Stream:
    def __init__(self, channel):
        self.channel = channel
        self.closed = False
        self.data = ''

    def write(self, data):
        self.data += data

    def flush(self):
        pass

    def close(self):
        self.closed = True


class TransportTests(unittest.TestCase):
    def probe(self, payload, **options):
        channel = Channel(payload, **options)
        streams = tuple(Stream(channel) for _ in range(3))
        called = []
        class Client:
            def exec_command(self, command, **kwargs):
                called.append((command, kwargs))
                return streams
        @contextlib.contextmanager
        def connection(secrets, *, host_key_reviewed):
            self.assertTrue(host_key_reviewed)
            yield Client()
        with patch('lens_release_readiness._trusted_connection', connection):
            result = run_release_readiness(object(), host_key_reviewed=True)
        self.assertTrue(all(stream.closed for stream in streams))
        self.assertEqual(called[0][0], 'python3 -I -')
        self.assertFalse(called[0][1]['get_pty'])
        return result

    def test_valid_transport_does_not_claim_release_ready(self):
        payload = {**dict.fromkeys(BOOL_FIELDS, False), **dict.fromkeys(COUNT_FIELDS, 0)}
        result = self.probe(json.dumps(payload).encode())
        self.assertTrue(result['readOnlyProbePassed'])
        self.assertFalse(result['runtimeIdentified'])
        self.assertFalse(result['writeEnabled'])

    def test_raw_response_stderr_and_exit_fail_closed(self):
        for payload, options in ((b'synthetic-private-value', {}), (b'{}', {'stderr': True}), (b'{}', {'exit_code': 1}), (b'x' * 4097, {})):
            result = self.probe(payload, **options)
            self.assertFalse(result['ok'])
            self.assertNotIn('synthetic-private-value', json.dumps(result))

    def test_failed_trust_prevents_command_execution(self):
        @contextlib.contextmanager
        def denied(secrets, *, host_key_reviewed):
            raise SafeFailure('host_key_untrusted')
            yield
        with patch('lens_release_readiness._trusted_connection', denied):
            result = run_release_readiness(object(), host_key_reviewed=True)
        self.assertFalse(result['hostKeyTrusted'])
        self.assertFalse(result['sshConnected'])
        self.assertFalse(result['writeEnabled'])


NODE_HARNESS = r"""
const vm = require('node:vm');
const path = require('node:path');
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const scenario = input.scenario;
let monitorCalls = 0, queries = 0, invalidQuery = false;
const columns = Object.entries({id:['varchar',36], ownerId:['int'], storageKey:['varchar',40], filename:['varchar',180], contentType:['varchar',100], byteSize:['int'], createdAt:['datetime']}).map(([name, type]) => ({COLUMN_NAME:name, DATA_TYPE:type[0], CHARACTER_MAXIMUM_LENGTH:type[1], IS_NULLABLE:'NO', COLUMN_KEY:name==='id'?'PRI':'', COLUMN_TYPE:name==='byteSize'?'int unsigned':type[0]}));
if (scenario === 'incompatible') columns[0].IS_NULLABLE = 'YES';
const fixtureFs = {
  statSync: () => ({isFile:()=>true, size:100}),
  readFileSync: file => file.endsWith('package.json') ? JSON.stringify({dependencies:{'@nestjs/core':'synthetic'}}) : Buffer.from('DB_HOST=synthetic.invalid'),
  existsSync: file => !file.endsWith('/.env') && (file.includes('/public/file') || file.includes('/private/attachments') || file.includes('/dist/')),
  realpathSync: file => file,
  lstatSync: file => ({isSymbolicLink:()=>scenario==='symlink' && file.endsWith('/public/file'), isDirectory:()=>true, mode:0o700}),
  readdirSync: () => scenario==='legacy' ? [{name:'synthetic.txt',isSymbolicLink:()=>false,isDirectory:()=>false,isFile:()=>true}] : [],
};
const connection = {destroy(){}, async execute(options) {
  queries++;
  if (!/^SELECT\b/.test(options.sql)) invalidQuery=true;
  if (scenario==='db_failure') throw new Error('synthetic-private-value');
  return [options.sql.includes('COLUMNS') ? (scenario==='absent'?[]:columns) : [{INDEX_NAME:'synthetic',SEQ_IN_INDEX:1,COLUMN_NAME:'ownerId'}, {INDEX_NAME:'synthetic',SEQ_IN_INDEX:2,COLUMN_NAME:'id'}]];
}};
const row = {name:'lens-synthetic',pm2_env:{pm_cwd:'/synthetic/lens-service',node_version:scenario==='old_node'?'18.0.0':'20.0.0',DB_HOST:'synthetic.invalid',DB_USER:'synthetic-user',DB_DATABASE:'synthetic-db',DB_PASS:'synthetic-private-value'}};
function fakeRequire(name) {
  if(name==='node:fs')return fixtureFs;
  if(name==='node:path')return path;
  if(name==='node:os')return {tmpdir:()=>'/synthetic-tmp'};
  if(name==='semver')return {satisfies: version=>Number(version.split('.')[0])>=20};
  if(name==='pm2-axon')return {socket:()=>({on(){},connect(){},close(){}})};
  if(name==='pm2-axon-rpc')return {Client:class {call(method,args,cb){monitorCalls++;if(method!=='getMonitorData')throw new Error('unexpected_operation');cb(null,scenario==='ambiguous'?[row,row]:[row]);}}};
  if(name==='mysql2/promise')return {createConnection:async()=>connection};
  throw new Error('unexpected_module');
}
fakeRequire.resolve=name=>name;
let output='';
const processMock={argv:['node','/synthetic/pm2','/synthetic/rpc'],stdout:{write:value=>{output+=value}},exit:()=>{require('node:process').stdout.write(JSON.stringify({result:JSON.parse(output),monitorCalls,queries,invalidQuery}));}};
vm.runInNewContext(input.program,{require:fakeRequire,process:processMock,setTimeout(){},Buffer,Map,Object,Number,Boolean,String,JSON});
"""


class RemoteEvidenceTests(unittest.TestCase):
    def inspect(self, scenario):
        child = subprocess.run(['node', '-e', NODE_HARNESS],
                               input=json.dumps({'program': NODE_PROGRAM, 'scenario': scenario}),
                               capture_output=True, text=True, timeout=5)
        self.assertEqual(child.returncode, 0)
        self.assertNotIn('synthetic-private-value', child.stdout + child.stderr)
        value = json.loads(child.stdout)
        self.assertFalse(value['invalidQuery'])
        self.assertEqual(value['monitorCalls'], 1)
        return value

    def test_compatible_schema_private_storage_and_owner_index(self):
        value = self.inspect('valid')
        for key in ('runtimeIdentified', 'runtimeNodeCompatible', 'attachmentSchemaChecked', 'attachmentTablePresent', 'attachmentSchemaCompatible', 'attachmentOwnerIndexPresent', 'privateStoragePresent', 'privateStorageOutsidePublic', 'privateStoragePermissionsRestricted', 'legacyScanComplete', 'attachmentBoundaryDeployed'):
            self.assertTrue(value['result'][key], key)
        self.assertEqual(value['queries'], 2)

    def test_missing_table_is_evidence_not_success(self):
        value = self.inspect('absent')
        self.assertTrue(value['result']['attachmentSchemaChecked'])
        self.assertFalse(value['result']['attachmentTablePresent'])
        self.assertFalse(value['result']['attachmentSchemaCompatible'])

    def test_nullable_mismatch_is_rejected(self):
        self.assertFalse(self.inspect('incompatible')['result']['attachmentSchemaCompatible'])

    def test_legacy_documents_are_counted_without_reading_contents(self):
        self.assertEqual(self.inspect('legacy')['result']['publicLegacyDocumentCount'], 1)

    def test_symlink_scan_remains_unconfirmed(self):
        self.assertFalse(self.inspect('symlink')['result']['legacyScanComplete'])

    def test_runtime_requirement_excludes_old_node(self):
        self.assertFalse(self.inspect('old_node')['result']['runtimeNodeCompatible'])

    def test_ambiguous_runtime_does_not_read_database(self):
        value = self.inspect('ambiguous')
        self.assertFalse(value['result']['runtimeIdentified'])
        self.assertEqual(value['queries'], 0)

    def test_database_error_returns_no_raw_exception(self):
        self.assertFalse(self.inspect('db_failure')['result']['attachmentSchemaChecked'])


NGINX_HARNESS = r"""
const vm=require('node:vm'), path=require('node:path');
const input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const config='/synthetic/nginx.conf';
const files={
  '/proc/123/comm':'nginx\n',
  '/proc/123/cmdline':input.compiledPath?'nginx: master process nginx':'nginx: master process nginx -c '+config,
  [config]:'http { include /synthetic/conf/*.conf; }',
  '/synthetic/conf/lens.conf':input.config,
};
if(input.cycle)files['/synthetic/conf/lens.conf']='include '+config+';';
const fs={
  readdirSync:dir=>dir==='/proc'?['123']:dir==='/synthetic/conf'?['lens.conf']:[],
  readFileSync:file=>{if(!(file in files))throw new Error('synthetic-private-value');return files[file];},
  readlinkSync:()=>'/synthetic/bin/nginx',
  statSync:file=>({size:input.oversized?1048577:Buffer.byteLength(files[file]||'')}),
};
const context={fs,path,Buffer,Set,RegExp,Error,require:name=>{
  if(name!=='node:child_process')throw new Error('unexpected_module');
  return {spawnSync:(executable,args)=>{
    if(executable!=='/synthetic/bin/nginx'||args.join(',')!=='-V')throw new Error('unexpected_operation');
    return {status:0,stderr:'configure arguments: --prefix=/synthetic --conf-path=/synthetic/nginx.conf',stdout:''};
  }};
}};
vm.createContext(context);
vm.runInContext(input.helper+'; result=inspectNginx("/synthetic/Lens/service");',context);
process.stdout.write(JSON.stringify(context.result));
"""


class NginxReadOnlyTests(unittest.TestCase):
    def inspect(self, config, **options):
        child = subprocess.run(['node', '-e', NGINX_HARNESS], capture_output=True,
                               text=True, timeout=5,
                               input=json.dumps(dict(helper=NGINX_HELPER, config=config, **options)))
        self.assertEqual(child.returncode, 0)
        self.assertNotIn('synthetic-private-value', child.stdout + child.stderr)
        return json.loads(child.stdout)

    def test_included_lens_static_mapping_is_detected(self):
        result = self.inspect('server { root /synthetic/Lens/service/public; location / { try_files $uri /index.html; } }')
        self.assertTrue(result['nginxConfigLoadComplete'])
        self.assertTrue(result['nginxLensPathReferenceFound'])
        self.assertTrue(result['nginxLegacyStaticMappingCandidate'])

    def test_proxy_only_configuration_is_unconfirmed(self):
        result = self.inspect('server { location / { proxy_pass http://synthetic.invalid; } }')
        self.assertTrue(result['nginxConfigLoadComplete'])
        self.assertFalse(result['nginxLensPathReferenceFound'])
        self.assertFalse(result['nginxLegacyStaticMappingCandidate'])

    def test_other_project_is_not_reported_as_lens(self):
        self.assertFalse(self.inspect('server { root /synthetic/other/public; }')['nginxLensPathReferenceFound'])

    def test_comments_and_quoted_delimiters_do_not_change_scope(self):
        result = self.inspect('# root /synthetic/Lens/service/public;\nserver { add_header example "value;{}#"; root "/synthetic/other/public"; }')
        self.assertTrue(result['nginxConfigLoadComplete'])
        self.assertFalse(result['nginxLensPathReferenceFound'])

    def test_include_cycle_and_oversized_config_are_unconfirmed(self):
        for options in ({'cycle': True}, {'oversized': True}):
            result = self.inspect('server {}', **options)
            self.assertFalse(result['nginxConfigLoadComplete'])
            self.assertFalse(result['nginxLensPathReferenceFound'])

    def test_raw_mapping_does_not_certify_route_isolation(self):
        result = self.inspect('server { root /synthetic/Lens/service/public;')
        self.assertTrue(result['nginxLegacyStaticMappingCandidate'])
        self.assertNotIn('routesSafe', result)

    def test_compiled_path_discovery_only_runs_version_command(self):
        result = self.inspect('server { root /synthetic/Lens/service/public; }', compiledPath=True)
        self.assertTrue(result['nginxConfigLocated'])
        self.assertTrue(result['nginxConfigLoadComplete'])
        self.assertTrue(result['nginxLegacyStaticMappingCandidate'])


if __name__ == '__main__':
    unittest.main()
