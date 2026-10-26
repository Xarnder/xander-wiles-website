import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSheet, adjustDeletedReferences } from './csv-formulas.js';
import { parseCsv, serializeCsv } from './csv.js';

test('arithmetic precedence, unary signs, grouping and decimals', () => {
    assert.deepEqual(calculateSheet([['=2+3*4', '=(2+3)*4', '=10/4-1', '=-2*-3', '=0.1+0.2']])[0], ['14','20','1.5','6','0.3']);
});
test('references, currency, blanks, ranges in both directions and dependencies', () => {
    const rows = [['Cost','Qty','Total'], ['$1,200','2','=A2*B2'], ['£100','','=SUM(A2:B3)'], ['=SUM(C2:C3)','=SUM(B3:A2)','=SUM(1,2,3)']];
    const v = calculateSheet(rows);
    assert.equal(v[1][2], '2400'); assert.equal(v[2][2], '1302');
    assert.equal(v[3][0], '3702'); assert.equal(v[3][1], '1302'); assert.equal(v[3][2], '6');
    rows[1][0] = '10'; assert.equal(calculateSheet(rows)[1][2], '20');
});
test('errors propagate, cycles terminate, arbitrary code is rejected', () => {
    const v = calculateSheet([['=1/0','=A1+2','=B2','=Z999'], ['=A2','=C1','=alert(1)','=1+'], ['text','=A3+1','=SUM(A1:B1)','=1e309']]);
    assert.deepEqual(v[0], ['#DIV/0!','#DIV/0!','#CYCLE!','#REF!']);
    assert.deepEqual(v[1], ['#CYCLE!','#CYCLE!','#NAME?','#ERROR!']);
    assert.deepEqual(v[2], ['text','#VALUE!','#DIV/0!','#NUM!']);
});
test('CSV round trip retains formulas and quoted function arguments', () => {
    const rows = [['3','=SUM(A1,2)','=A1*2']];
    assert.deepEqual(parseCsv(serializeCsv(rows)).rows, rows);
    assert.deepEqual(calculateSheet(rows)[0], ['3','5','6']);
});
test('deletion preserves references and marks deleted targets including absolute references', () => {
    assert.deepEqual(adjustDeletedReferences([['=$B$3+B2+A1']], 'row', 1), [['=$B$2+#REF!+A1']]);
    assert.deepEqual(adjustDeletedReferences([['=$C$3+B2+A1']], 'column', 1), [['=$B$3+#REF!+A1']]);
});

test('purchase Markdown paste converts dates and separate currencies with offset totals', async () => {
    const { purchaseMarkdownRows } = await import('./csv.js');
    const rows = purchaseMarkdownRows('# Shopping\n- Oven {{date:2026-09-12}} - $1,200\n- Sofa - £1000 {{date:2026-10-19}}\n**Total: wrong**');
    assert.deepEqual(rows[0], ['Item', 'Date', 'USD', 'GBP']);
    assert.deepEqual(calculateSheet(rows).at(-1), ['Total', '', '1200', '1000']);
    assert.equal(purchaseMarkdownRows('- Oven - $20', 2, 1).at(-1)[2], '=SUM(D4:D4)');
    assert.equal(purchaseMarkdownRows('- Oven - $20\n- Unknown price'), null);
});

test('formula chains resolve forward references and recalculate every dependent cell', () => {
    const rows = [['=B1+10', '=C1*2', '=D1/4', '80']];
    assert.deepEqual(calculateSheet(rows)[0], ['50', '40', '20', '80']);
    rows[0][3] = '120';
    assert.deepEqual(calculateSheet(rows)[0], ['70', '60', '30', '120']);
    rows[0][2] = '=D1/2';
    assert.deepEqual(calculateSheet(rows)[0], ['130', '120', '60', '120']);
    assert.equal(rows[0][0], '=B1+10');
});

test('SUM combines formula cells and shared dependencies without false cycles', () => {
    const rows = [['10', '=A1*2', '=A1+5', '=SUM(B1:C1)', '=D1-B1']];
    assert.deepEqual(calculateSheet(rows)[0], ['10', '20', '15', '35', '15']);
    rows[0][0] = '=1/0';
    assert.deepEqual(calculateSheet(rows)[0], Array(5).fill('#DIV/0!'));
    rows[0][0] = '20';
    assert.deepEqual(calculateSheet(rows)[0], ['20', '40', '25', '65', '25']);
});
