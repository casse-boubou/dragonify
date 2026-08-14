import Docker from "dockerode"
import EventEmitter from "events"

import { chain } from "stream-chain"
import { parser } from "stream-json/jsonl/Parser"
import { logger } from "./logger"

export function getEventStream(docker: Docker): EventEmitter {
  const emitter = new EventEmitter()

  const opts: Docker.GetEventsOptions = {
    filters: {
      type: ["container"],
      event: ["start", "stop"],
    },
  }

  docker.getEvents(opts, (err, rawStream) => {
    const stream = chain<any[]>([
      rawStream,
      parser()
    ])

    stream.on("data", (data) => {
      const eventData = data.value
      const eventType = `${eventData.Type}.${eventData.Action}`

      logger.debug(`docker-events: Emitted "${eventType}":`, eventData.Actor)
      emitter.emit(eventType, eventData.Actor)
    })
  })

  return emitter
}
