// Standalone optional internal service; no .env import, database or app startup.
import {createCompetitionHintBroker} from '../src/websocket/competition-hint-transport.js'
const broker=createCompetitionHintBroker({secret:process.env.COMPETITION_HINT_BROKER_SECRET,host:process.env.COMPETITION_HINT_BROKER_BIND??'127.0.0.1',port:Number(process.env.COMPETITION_HINT_BROKER_PORT??5065)})
const address=await broker.listen();console.log(`Native hint broker listening on ${address.address}:${address.port}`)
for(const event of ['SIGINT','SIGTERM'])process.on(event,async()=>{await broker.close();process.exit(0)})
