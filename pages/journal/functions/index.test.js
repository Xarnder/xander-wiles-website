const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const monitoring = require('@google-cloud/monitoring');
const originalListTimeSeries = monitoring.MetricServiceClient.prototype.listTimeSeries;
let monitoringCalls = 0;

// Exercise the upgraded SDKs without reading credentials or contacting Google Cloud.
monitoring.MetricServiceClient.prototype.listTimeSeries = async () => {
    monitoringCalls++;
    return [[{ points: [{ value: { int64Value: '17' } }, { value: { int64Value: '25' } }] }]];
};

const functionsTest = require('firebase-functions-test')({ projectId: 'demo-local' });
const { getFirestoreReadCount } = require('./index');
const wrapped = functionsTest.wrap(getFirestoreReadCount);

after(() => {
    monitoring.MetricServiceClient.prototype.listTimeSeries = originalListTimeSeries;
    functionsTest.cleanup();
});

test('rejects unauthenticated requests before querying Monitoring', async () => {
    await assert.rejects(wrapped({ data: {} }), { code: 'unauthenticated' });
    assert.equal(monitoringCalls, 0);
});

test('returns the summed read count through the callable test SDK', async () => {
    const result = await wrapped({ data: {}, auth: { uid: 'local-test' } });
    assert.equal(result.count, 42);
    assert.equal(result.projectId, 'demo-local');
    assert.ok(Number.isFinite(Date.parse(result.since)));
    assert.equal(monitoringCalls, 1);
});
