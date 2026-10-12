const { seed, cleanup } = require('../tests/fixtures');
(async () => {
    process.env.ENABLE_DEV_ACTIVATION = 'true';
    await seed();
    const app = require('../src/app');
    const server = app.listen(5100, '0.0.0.0', () => console.log('Isolated fixture API ready on port 5100; database connected.'));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
        server.close(async () => { await cleanup(); process.exit(0); });
    });
})().catch(async () => { console.error('Fixture server could not connect.'); await cleanup(); process.exitCode = 1; });
