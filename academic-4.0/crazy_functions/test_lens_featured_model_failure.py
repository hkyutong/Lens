import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

ACADEMIC_ROOT = Path(__file__).resolve().parents[1]
if str(ACADEMIC_ROOT) not in sys.path:
    sys.path.insert(0, str(ACADEMIC_ROOT))

from crazy_functions import Lens_Featured_Tasks as featured

fixture_spec = importlib.util.spec_from_file_location(
    'proposal_contract_fixture', Path(__file__).with_name('test_lens_research_proposal.py')
)
fixture = importlib.util.module_from_spec(fixture_spec)
fixture_spec.loader.exec_module(fixture)


class SyntheticChatbot(list):
    def get_cookies(self):
        return {}


class FeaturedModelFailureTests(unittest.TestCase):
    def setUp(self):
        self.spec = featured.TASKS[featured.PROPOSAL_TASK]
        self.input_text = '设计一项八周的形成性反馈研究；人数为假设。'
        self.valid_output = json.dumps(fixture.full_proposal(), ensure_ascii=False)

    def run_pipeline(self, outputs, task_key=None, input_text=None):
        calls = []
        published = []
        chatbot = SyntheticChatbot()
        history = []
        toolbox = ModuleType('toolbox')
        worker = ModuleType('crazy_functions.crazy_utils')

        def update_ui(**kwargs):
            yield None

        def request_model(**kwargs):
            calls.append(kwargs)
            if False:
                yield
            return outputs[min(len(calls) - 1, len(outputs) - 1)]

        toolbox.update_ui = update_ui
        worker.request_gpt_model_in_new_thread_with_ui_alive = request_model
        with patch.dict(sys.modules, {'toolbox': toolbox, 'crazy_functions.crazy_utils': worker}), patch.object(
            featured, 'publish_proposal', side_effect=lambda report, _chatbot: published.append(report)
        ):
            list(featured._run_task(
                task_key or self.spec.name, input_text or self.input_text,
                {}, {}, chatbot, history, '', None
            ))
        return calls, published, chatbot, history

    def test_transport_failure_is_not_retried_as_invalid_json(self):
        calls, published, chatbot, history = self.run_pipeline([
            '学术服务连接异常，请稍后重试。\n\n请稍后重试。'
        ])
        self.assertEqual(len(calls), 1)
        self.assertEqual(published, [])
        self.assertEqual(history, [])
        self.assertEqual(chatbot[0][1], '特色能力暂时无法完成，请稍后重试。')

    def test_successful_complete_report_keeps_existing_pipeline(self):
        calls, published, chatbot, history = self.run_pipeline([self.valid_output])
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(published), 1)
        self.assertEqual(chatbot[0][1], published[0])
        self.assertEqual(history[-1], published[0])

    def test_invalid_model_json_still_gets_one_schema_repair(self):
        calls, published, _chatbot, _history = self.run_pipeline(['synthetic invalid JSON', self.valid_output])
        self.assertEqual(len(calls), 2)
        self.assertEqual(len(published), 1)

    def test_transport_failure_during_schema_repair_is_not_a_validation_result(self):
        calls, published, chatbot, history = self.run_pipeline([
            'synthetic invalid JSON', '  学术服务连接异常，请稍后重试。\n\n'
        ])
        self.assertEqual(len(calls), 2)
        self.assertEqual(published, [])
        self.assertEqual(history, [])
        self.assertEqual(chatbot[0][1], '特色能力暂时无法完成，请稍后重试。')

    def task_material(self, key):
        material = (
            'Paper: Synthetic A\nRainfall is associated with plant height.\n\n'
            'Paper: Synthetic B\nSoil moisture may confound this association.'
        )
        if key == 'Lens｜审稿意见应答':
            material = '1. Explain the measurements.\n2. Discuss confounding.\n\n' + material
        return material

    def test_other_featured_tasks_keep_successful_json_results(self):
        for key, spec in featured.TASKS.items():
            if key == self.spec.name:
                continue
            with self.subTest(task=key):
                material = self.task_material(key)
                task_input = featured.prepare_input(key, material)
                request = featured.strict_model_request(spec, task_input)
                output = request.split('完整输出示例（必须保留 rows 数量，不能返回空数组）：\n', 1)[1].split('\n任务：', 1)[0]
                calls, published, chatbot, history = self.run_pipeline([output], key, material)
                self.assertEqual(len(calls), 1)
                self.assertEqual(published, [])
                self.assertIn(spec.title, chatbot[0][1])
                self.assertEqual(history[-1], chatbot[0][1])

    def test_other_featured_tasks_do_not_repair_transport_notices(self):
        for key in featured.TASKS:
            if key == self.spec.name:
                continue
            with self.subTest(task=key):
                calls, published, chatbot, history = self.run_pipeline(
                    ['学术服务连接异常，请稍后重试。'], key, self.task_material(key)
                )
                self.assertEqual(len(calls), 1)
                self.assertEqual(published, [])
                self.assertEqual(history, [])
                self.assertEqual(chatbot[0][1], '特色能力暂时无法完成，请稍后重试。')


if __name__ == '__main__':
    unittest.main()
