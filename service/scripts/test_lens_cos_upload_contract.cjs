'use strict';

// Exercises the real SDK against a loopback server with synthetic data only.
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const root = process.argv[2] || path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, 'package.json'));
const COS = localRequire('cos-nodejs-sdk-v5');
const facts = { upload_success:false, empty_upload:false, binary_upload:false,
  encoded_key:false, provider_error:false, transport_error:false,
  legacy_request_removed:false, xml_parser_replaced:false };
async function upload(mode, key, body) {
  let observed;
  const server = http.createServer((request, response) => {
    const chunks=[];
    request.on('data', chunk=>chunks.push(chunk));
    request.on('end',()=>{
      observed={body:Buffer.concat(chunks),url:request.url,method:request.method};
      if(mode==='transport'){request.socket.destroy();return;}
      if(mode==='denied'){
        response.writeHead(403,{'content-type':'application/xml'});
        response.end('<Error><Code>AccessDenied</Code><Message>synthetic denial</Message></Error>');
        return;
      }
      response.writeHead(200,{'etag':'"synthetic-etag"','x-cos-request-id':'synthetic-request'});
      response.end();
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const client=new COS({SecretId:'synthetic-id',SecretKey:'synthetic-secret',
    Protocol:'http:',Domain:'127.0.0.1:'+server.address().port,Timeout:800,
    FileParallelLimit:1,ChunkRetryTimes:0});
  try {
    const result=await new Promise(resolve=>client.putObject({Bucket:'synthetic-1250000000',
      Region:'ap-synthetic',Key:key,StorageClass:'STANDARD',Body:body},
      (error,data)=>resolve({error,data})));
    if(mode==='denied')return !!result.error&&result.error.statusCode===403&&result.error.code==='AccessDenied';
    if(mode==='transport')return !!result.error;
    if(result.error||result.data?.statusCode!==200||typeof result.data?.Location!=='string')return false;
    if(!observed||observed.method!=='PUT'||!observed.body.equals(body))return false;
    return decodeURIComponent(observed.url.split('?')[0]).endsWith('/'+key);
  } finally {
    if(server.closeAllConnections)server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
}
(async()=>{
 facts.upload_success=await upload('success','synthetic/test.txt',Buffer.from('synthetic upload'));
 facts.empty_upload=await upload('success','synthetic/empty.txt',Buffer.alloc(0));
 facts.binary_upload=await upload('success','synthetic/data.bin',Buffer.from([0,1,127,128,255]));
 facts.encoded_key=await upload('success','synthetic/a b-材料.txt',Buffer.from('synthetic unicode'));
 facts.provider_error=await upload('denied','synthetic/denied.txt',Buffer.from('synthetic'));
 facts.transport_error=await upload('transport','synthetic/interrupted.txt',Buffer.from('synthetic'));
 const loaded=Object.keys(require.cache);
 facts.legacy_request_removed=!loaded.some(file=>/[\\/]node_modules[\\/]request[\\/]/.test(file));
 facts.xml_parser_replaced=!loaded.some(file=>/[\\/]node_modules[\\/]fast-xml-parser[\\/]/.test(file));
 const result={contract_passed_count:Object.entries(facts).filter(([key,v])=>!key.endsWith('removed')&&!key.endsWith('replaced')&&v).length,
   contract_failed_count:Object.entries(facts).filter(([key,v])=>!key.endsWith('removed')&&!key.endsWith('replaced')&&!v).length,
   security_passed_count:Number(facts.legacy_request_removed)+Number(facts.xml_parser_replaced),
   legacy_request_removed:facts.legacy_request_removed,xml_parser_replaced:facts.xml_parser_replaced,
   success: Object.values(facts).every(Boolean)};
 console.log(JSON.stringify(result));
 process.exitCode = result.success ? 0 : 1;
})().catch(()=>{console.log(JSON.stringify({success:false,error_category:'synthetic_contract_runner_failed'}));process.exitCode=1;});
