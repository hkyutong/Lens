import json
import unittest
from pathlib import Path
from unittest.mock import patch
import types

from crazy_functions.lens_research_tasks import (
    TASKS, TaskResultError, model_request, prepare_input,
    strict_model_request, validate_and_render,
)


SECTION_IDS = (
    'background', 'questions_hypotheses', 'literature_strategy', 'measures',
    'sample_size', 'design', 'timeline', 'analysis', 'ethics',
    'limitations', 'reference_checks',
)


def full_proposal():
    return {
        'title': '形成性反馈与学习投入：研究方案',
        'summary': '这是一份用于验收的合成研究方案，所有人数和情境均为待验证假设。',
        'assumptions': ['两组平行班及样本人数均为设计假设，需要正式调查后确认。'],
        'sections': [
            {'id': section_id, 'content': (
                '本节记录合成研究的具体操作、判断依据、执行条件及失败时的处理方式。'
                '研究人员需要核对课程条件和测量适用性，在开始收集资料前确认可行性；'
                '所有尚未得到证据支持的判断都应标注为假设，不将预期效果写成研究结论。'
                '执行过程使用统一记录表，保留方案偏离及调整原因，以便后续复核。'
            ) * 3}
            for section_id in SECTION_IDS
        ],
        'references': [],
    }


class ResearchProposalContractTests(unittest.TestCase):
    def setUp(self):
        self.spec = TASKS['Lens｜研究方案设计']
        self.task_input = prepare_input(self.spec.name, '设计一项八周的形成性反馈研究；人数为假设。')

    def render(self, data):
        return validate_and_render(self.spec, self.task_input, json.dumps(data, ensure_ascii=False))

    def test_rejects_previously_accepted_short_table(self):
        legacy = {'rows': [{'step_id': 1, 'task': '待核验', 'deliverable': '待核验', 'criterion': '待核验', 'depends_on': [], 'status': 'proposal', 'refs': [{'source_id': 'D1', 'quote': '一项尚未开展的合成教育研究。'}]}, {'step_id': 2, 'task': '待核验', 'deliverable': '待核验', 'criterion': '待核验', 'depends_on': [1], 'status': 'proposal', 'refs': []}, {'step_id': 3, 'task': '待核验', 'deliverable': '待核验', 'criterion': '待核验', 'depends_on': [1, 2], 'status': 'proposal', 'refs': []}]}
        with self.assertRaises(TaskResultError):
            self.render(legacy)

    def test_renders_all_full_report_sections(self):
        report = self.render(full_proposal())
        self.assertGreater(len(report), 2400)
        for heading in ('研究背景', '研究问题与假设', '文献检索策略', '测量工具',
                        '样本量', '研究设计', '逐周执行计划', '分析计划',
                        '伦理', '局限', '参考资料核验'):
            self.assertIn(heading, report)
        self.assertIn('待验证假设', report)
        self.assertIn('尚无已核验参考资料', report)

    def test_missing_or_duplicate_section_is_rejected(self):
        for mode in ('missing', 'duplicate'):
            data = full_proposal()
            if mode == 'missing':
                data['sections'].pop()
            else:
                data['sections'][-1]['id'] = 'background'
            with self.subTest(mode=mode), self.assertRaises(TaskResultError):
                self.render(data)

    def test_short_section_or_summary_only_is_rejected(self):
        for data in ({'title': '研究方案', 'summary': '只有摘要'}, full_proposal()):
            if 'sections' in data:
                data['sections'][0]['content'] = '仅一句话'
            with self.assertRaises(TaskResultError):
                self.render(data)

    def test_reference_cannot_claim_an_unknown_source(self):
        data = full_proposal()
        data['references'] = [{'source_id': 'DOC-unknown', 'quote': '不存在的资料'}]
        with self.assertRaises(TaskResultError):
            self.render(data)

    def test_reference_quote_must_match_an_uploaded_source(self):
        data = full_proposal()
        self.task_input.sources['DOC1'] = '合成资料中明确提供的研究背景。'
        data['references'] = [{'source_id': 'DOC1', 'quote': '捏造的引文'}]
        with self.assertRaises(TaskResultError):
            self.render(data)
        data['references'][0]['quote'] = '明确提供的研究背景'
        self.assertIn('DOC1', self.render(data))

    def test_model_and_retry_requests_require_the_complete_schema(self):
        for prompt in (model_request(self.spec, self.task_input),
                       strict_model_request(self.spec, self.task_input)):
            data = json.loads(prompt)
            self.assertEqual(set(data['schema']['sections']), set(SECTION_IDS))
            self.assertTrue(data['requirements']['mark_assumptions'])
            self.assertTrue(data['requirements']['no_invented_references'])

    def test_report_labels_follow_supported_output_language(self):
        for language, heading in (('en', 'Analysis plan'), ('zh-TW', '分析計畫'),
                                  ('ja', '分析計画'), ('ko', '분석 계획')):
            data = full_proposal()
            data['language'] = language
            self.assertIn(heading, self.render(data))

    def test_complete_report_is_exported_through_the_signed_private_boundary(self):
        from crazy_functions.lens_research_proposal import publish_proposal
        from shared_utils import lens_request_security as security
        from shared_utils.test_lens_academic_bridge_contract import (
            BridgeContractTests, SyntheticChatbot, load_functions,
        )

        fixture = BridgeContractTests()
        fixture.setUp()
        try:
            # Load actual production functions while avoiding unrelated toolbox startup effects.
            namespace = load_functions(
                'toolbox.py', {'write_history_to_file', 'normalize_brand_text'}, fixture.toolbox,
            )
            namespace['gen_time_str'] = lambda: 'synthetic-time'
            toolbox = types.ModuleType('toolbox')
            toolbox.write_history_to_file = namespace['write_history_to_file']
            toolbox.promote_file_to_downloadzone = namespace['promote_file_to_downloadzone']
            chatbot = SyntheticChatbot({})
            report = self.render(full_proposal())
            with patch.dict('sys.modules', {'toolbox': toolbox}):
                publish_proposal(report, chatbot)
            files = chatbot._cookies['files_to_promote']
            self.assertEqual(len(files), 1)
            self.assertTrue(security.path_within(files[0], security.request_logging_root()))
            self.assertIn(report, Path(files[0]).read_text())
            reference = security.report_reference(files[0])
            self.assertIsInstance(reference, dict)
            self.assertNotIn(str(security.request_logging_root()), json.dumps(reference))
        finally:
            fixture.tearDown()

    def test_unrelated_tasks_keep_their_existing_contract(self):
        spec = TASKS['Lens｜研究问题拆解']
        task_input = prepare_input(spec.name, '如何研究学生的学习投入？')
        prompt = strict_model_request(spec, task_input)
        marker = '完整输出示例（必须保留 rows 数量，不能返回空数组）：\n'
        data = json.loads(prompt.split(marker, 1)[1].split('\n', 1)[0])
        self.assertIn(spec.title, validate_and_render(spec, task_input, json.dumps(data)))


if __name__ == '__main__':
    unittest.main()
