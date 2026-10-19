export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['audits/competition-2026-10-12/_evidence/realtime_transport.test.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
}
