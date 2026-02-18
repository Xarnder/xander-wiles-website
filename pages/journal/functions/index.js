const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const monitoring = require('@google-cloud/monitoring');

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

// Creates a client
const client = new monitoring.MetricServiceClient();

exports.getFirestoreReadCount = onCall(async (request) => {
    // Check for authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const projectId = process.env.GCLOUD_PROJECT || admin.instanceId().app.options.projectId;

    // Construct the request for Google Cloud Monitoring
    // Resource type for Firestore depends on the mode (Datastore or Native). usually "firestore_instance" or "datastore_database"
    // 'firestore.googleapis.com/document/read_count' resource type is 'firestore_instance' or 'consumed_api'
    // Let's try to be broad or use the specific resource type if known. 
    // Usually for recent Firestore Native it is 'firestore_instance'.

    const filter = `metric.type="firestore.googleapis.com/document/read_count" AND resource.type="firestore_instance"`;

    const now = new Date();
    // Create date for midnight Pacific Time (approximate quota reset time)
    // Cloud Monitoring data might be slightly delayed.
    const midnightPT = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    midnightPT.setHours(0, 0, 0, 0);

    // Convert to Timestamp structure expected by the API
    const startTimeRequest = {
        seconds: Math.floor(midnightPT.getTime() / 1000),
    };

    const endTimeRequest = {
        seconds: Math.floor(now.getTime() / 1000),
    };

    const monRequest = {
        name: client.projectPath(projectId),
        filter: filter,
        interval: {
            startTime: startTimeRequest,
            endTime: endTimeRequest,
        },
        view: 'FULL',
        // Group by nothing to get a single sum, or we can sum up client side.
        // Let's aggregate by aligning to a single point covering the whole range if possible, 
        // OR just fetch 1-hour chunks and sum them up. 
        // Fetching 1-hour chunks is safer for visualization usually, but we just need a total.
        aggregation: {
            alignmentPeriod: { seconds: 86400 }, // Align to 24 hours (larger than the window is fine to get one point per series)
            crossSeriesReducer: 'REDUCE_SUM',
            perSeriesAligner: 'ALIGN_SUM',
        },
    };

    try {
        const [timeSeries] = await client.listTimeSeries(monRequest);

        let totalReads = 0;

        // With REDUCE_SUM, we should get very few series (one per resource ideally)
        timeSeries.forEach(series => {
            series.points.forEach(point => {
                // Monitoring API returns value as int64 which is a string in JSON, or a Long object.
                // In Node client it might be a string or a number.
                const val = point.value.int64Value;
                if (val) {
                    totalReads += parseInt(val);
                }
            });
        });

        return {
            count: totalReads,
            since: midnightPT.toISOString(),
            projectId: projectId
        };
    } catch (error) {
        console.error("Error fetching metrics:", error);
        throw new HttpsError('internal', 'Unable to fetch metrics', { message: error.message });
    }
});
