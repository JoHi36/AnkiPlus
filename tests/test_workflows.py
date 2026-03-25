import unittest


class TestCapabilityRegistry(unittest.TestCase):
    def setUp(self):
        from ai.capabilities import CapabilityRegistry
        self.reg = CapabilityRegistry()

    def test_register_and_get_trigger(self):
        from ai.capabilities import CapabilityDefinition
        cap = CapabilityDefinition(name='timer', label='Timer', category='trigger', description='Scheduled trigger')
        self.reg.register(cap)
        result = self.reg.get('timer')
        self.assertIsNotNone(result)
        self.assertEqual(result.label, 'Timer')
        self.assertEqual(result.category, 'trigger')

    def test_register_and_get_output(self):
        from ai.capabilities import CapabilityDefinition
        cap = CapabilityDefinition(name='emotion', label='Emotion', category='output', description='Mood update')
        self.reg.register(cap)
        result = self.reg.get('emotion')
        self.assertEqual(result.category, 'output')

    def test_get_unknown_returns_none(self):
        self.assertIsNone(self.reg.get('nonexistent'))

    def test_list_by_category(self):
        from ai.capabilities import CapabilityDefinition
        self.reg.register(CapabilityDefinition(name='timer', label='Timer', category='trigger'))
        self.reg.register(CapabilityDefinition(name='chat', label='Chat', category='trigger'))
        self.reg.register(CapabilityDefinition(name='emotion', label='Emotion', category='output'))
        triggers = self.reg.list_by_category('trigger')
        self.assertEqual(len(triggers), 2)
        outputs = self.reg.list_by_category('output')
        self.assertEqual(len(outputs), 1)

    def test_get_for_frontend(self):
        from ai.capabilities import CapabilityDefinition
        self.reg.register(CapabilityDefinition(name='timer', label='Timer', category='trigger', description='Scheduled'))
        result = self.reg.get_for_frontend(['timer'])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'timer')
        self.assertEqual(result[0]['label'], 'Timer')
        self.assertEqual(result[0]['category'], 'trigger')


class TestWorkflowSchema(unittest.TestCase):
    def test_slot_defaults(self):
        from ai.workflows import Slot
        s = Slot(ref='search_deck')
        self.assertEqual(s.mode, 'on')

    def test_slot_locked(self):
        from ai.workflows import Slot
        s = Slot(ref='timer', mode='locked')
        self.assertEqual(s.mode, 'locked')

    def test_workflow_defaults(self):
        from ai.workflows import Workflow, Slot
        wf = Workflow(
            name='quiz',
            label='Quiz & Abfrage',
            description='Test',
            triggers=[Slot(ref='card_question_shown', mode='locked')],
            tools=[Slot(ref='ask_question')],
            outputs=[Slot(ref='chat_response')],
        )
        self.assertEqual(wf.mode, 'on')
        self.assertEqual(wf.status, 'active')
        self.assertEqual(wf.context_prompt, '')

    def test_workflow_soon_status(self):
        from ai.workflows import Workflow
        wf = Workflow(name='exam', label='Exam', description='', triggers=[], tools=[], outputs=[], status='soon', mode='off')
        self.assertEqual(wf.status, 'soon')
        self.assertEqual(wf.mode, 'off')

    def test_workflow_to_dict(self):
        from ai.workflows import Workflow, Slot
        wf = Workflow(
            name='quiz', label='Quiz', description='Desc',
            triggers=[Slot(ref='chat', mode='locked')],
            tools=[Slot(ref='search_deck')],
            outputs=[Slot(ref='widget', mode='off')],
        )
        d = wf.to_dict()
        self.assertEqual(d['name'], 'quiz')
        self.assertEqual(len(d['triggers']), 1)
        self.assertEqual(d['triggers'][0]['ref'], 'chat')
        self.assertEqual(d['triggers'][0]['mode'], 'locked')
        self.assertEqual(d['tools'][0]['mode'], 'on')
        self.assertEqual(d['outputs'][0]['mode'], 'off')


class TestAgentWorkflowIntegration(unittest.TestCase):
    def test_active_tools_collects_from_workflows(self):
        from ai.agents import AgentDefinition
        from ai.workflows import Workflow, Slot
        agent = AgentDefinition(
            name='test', label='Test', description='', color='#fff',
            workflows=[
                Workflow(name='wf1', label='WF1', description='',
                    tools=[Slot(ref='tool_a'), Slot(ref='tool_b', mode='off')]),
                Workflow(name='wf2', label='WF2', description='', mode='off',
                    tools=[Slot(ref='tool_c')]),
                Workflow(name='wf3', label='WF3', description='',
                    tools=[Slot(ref='tool_a'), Slot(ref='tool_d', mode='locked')]),
            ],
        )
        # wf1: tool_a (on), tool_b (off → excluded)
        # wf2: off workflow → excluded entirely
        # wf3: tool_a (dedup), tool_d (locked → included)
        tools = agent.active_tools
        self.assertEqual(tools, ['tool_a', 'tool_d'])

    def test_active_tools_empty_when_no_workflows(self):
        from ai.agents import AgentDefinition
        agent = AgentDefinition(name='test', label='Test', description='', color='#fff')
        self.assertEqual(agent.active_tools, [])
