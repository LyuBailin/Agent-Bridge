
const m = require('/home/lyublin/LLM/Agent-Bridge/src/core/main_index.js');
console.error('module exports keys:', Object.keys(m));
console.error('isQueuedTask type:', typeof m.isQueuedTask);
console.error('pollLoop type:', typeof m.pollLoop);
if (require.main === module) {
  console.error('calling main()');
  m.initEnvironment('/tmp/spawntest3').then(env => {
    console.error('env._writeResult type:', typeof env._writeResult);
    console.error('calling executeWorkflow...');
    return m.executeWorkflow(env, { schema_version:1, task_id:'t1', instruction:'write a.txt', status:'queued' }).then(r => {
      console.error('executeWorkflow result:', JSON.stringify(r));
    });
  }).catch(e => {
    console.error('ERROR:', e.message, e.stack);
    process.exit(1);
  });
}
