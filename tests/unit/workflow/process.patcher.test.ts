import { describe, it, expect } from 'vitest';
import { patchActivityName, patchActivityScriptFileName } from '../../../src/fluig/workflow/process/process.patcher';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions>
  <bpmn2:process id="proc1">
    <bpmn2:BpmnTask id="task1" name="Aprovar Pedido" type="1" />
    <bpmn2:BpmnServiceTask id="task2" name="Enviar Email" scriptFileName="proc1.sendEmail.js" type="3" />
    <bpmn2:BpmnTask id="task3" name="Tarefa Sem Nome" type="1" />
    <bpmn2:BpmnServiceTask id="task4" name="Script Ausente" type="3" />
  </bpmn2:process>
</bpmn2:definitions>`;

describe('process.patcher', () => {
    describe('patchActivityName', () => {
        it('updates name attribute in-place', () => {
            const result = patchActivityName(SAMPLE_XML, 'task1', 'Revisar Pedido');
            expect(result).toContain('name="Revisar Pedido"');
            expect(result).not.toContain('name="Aprovar Pedido"');
        });

        it('leaves other attributes unchanged', () => {
            const result = patchActivityName(SAMPLE_XML, 'task1', 'Novo Nome');
            expect(result).toContain('id="task1"');
            expect(result).toContain('type="1"');
        });

        it('leaves other activities unchanged', () => {
            const result = patchActivityName(SAMPLE_XML, 'task1', 'Novo');
            expect(result).toContain('name="Enviar Email"');
            expect(result).toContain('name="Tarefa Sem Nome"');
        });

        it('escapes XML special chars in new name', () => {
            const result = patchActivityName(SAMPLE_XML, 'task1', 'A & B <test>');
            expect(result).toContain('name="A &amp; B &lt;test&gt;"');
        });

        it('returns unchanged XML when id not found', () => {
            const result = patchActivityName(SAMPLE_XML, 'nonexistent', 'Novo');
            expect(result).toBe(SAMPLE_XML);
        });
    });

    describe('patchActivityScriptFileName', () => {
        it('updates existing scriptFileName attribute', () => {
            const result = patchActivityScriptFileName(SAMPLE_XML, 'task2', 'proc1.sendEmail_v2.js');
            expect(result).toContain('scriptFileName="proc1.sendEmail_v2.js"');
            expect(result).not.toContain('scriptFileName="proc1.sendEmail.js"');
        });

        it('leaves name and other attributes unchanged', () => {
            const result = patchActivityScriptFileName(SAMPLE_XML, 'task2', 'novo.js');
            expect(result).toContain('name="Enviar Email"');
            expect(result).toContain('id="task2"');
        });

        it('adds scriptFileName when attribute is absent', () => {
            const result = patchActivityScriptFileName(SAMPLE_XML, 'task4', 'proc1.scriptAusente.js');
            expect(result).toContain('scriptFileName="proc1.scriptAusente.js"');
        });

        it('preserves document structure — same line count', () => {
            const before = SAMPLE_XML.split('\n').length;
            const result = patchActivityScriptFileName(SAMPLE_XML, 'task2', 'outro.js');
            expect(result.split('\n').length).toBe(before);
        });
    });
});
