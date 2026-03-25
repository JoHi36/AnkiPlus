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
