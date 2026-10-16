"""The HTTP/WS bridge must never log user payloads or exception values."""
import ast
from pathlib import Path
import unittest


class BridgeLogBoundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = ast.parse(Path(__file__).with_name('fastapi_stream_server.py').read_text())

    def test_bridge_events_do_not_interpolate_user_or_runtime_values(self):
        unsafe = []
        for node in ast.walk(self.tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and isinstance(node.func.value, ast.Name) and node.func.value.id == 'logger'):
                continue
            if node.func.attr not in ('info', 'warning', 'error', 'exception', 'debug', 'critical'):
                continue
            if (node.func.attr == 'exception' or len(node.args) != 1
                    or not isinstance(node.args[0], ast.Constant)
                    or not isinstance(node.args[0].value, str) or node.keywords):
                unsafe.append(node.lineno)
        self.assertEqual(len(unsafe), 0, 'bridge_log_projection_must_be_constant')

    def test_all_bridge_sinks_disable_exception_local_variable_dumping(self):
        sinks = [node for node in ast.walk(self.tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Attribute) and node.func.attr == 'add'
                 and isinstance(node.func.value, ast.Name) and node.func.value.id == 'logger']
        self.assertGreater(len(sinks), 0)
        for sink in sinks:
            options = {option.arg: option.value for option in sink.keywords}
            for name in ('backtrace', 'diagnose'):
                self.assertIn(name, options, 'bridge_log_sink_must_disable_diagnostics')
                self.assertIsInstance(options[name], ast.Constant)
                self.assertIs(options[name].value, False)


if __name__ == '__main__':
    unittest.main()
