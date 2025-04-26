import Docker from "dockerode"
import { getEventStream } from "./docker-events"
import { logger } from "./logger"

const CUSTOM_NETWORK_NAMES: string | undefined = process.env.CUSTOMS_NETWORKS
var networks_names: string[] = ["apps-internal"]
if (CUSTOM_NETWORK_NAMES !== undefined) {
  var networks_names: string[] = CUSTOM_NETWORK_NAMES.split(',')
}

async function setUpNetwork(docker: Docker) {
  for (let i = 0; i < networks_names.length; i++) {
    logger.info(`Setting up network ${networks_names[i]}`)

    const existingNetworks = await docker.listNetworks({filters: {name: [networks_names[i]]}})
    if (existingNetworks.length === 1) {
      logger.info(`Network ${networks_names[i]} already exists`)
    }

    else {
      await docker.createNetwork({
        Name: networks_names[i],
        Driver: "bridge",
        Internal: true,
        Labels: {
          "tj.horner.dragonify.networks": "true"
        },
      })

      logger.info(`Network ${networks_names[i]} created`)
    }
  }
}

function getDnsName(container: Docker.ContainerInfo) {
  const service = container.Labels["com.docker.compose.service"]
  const project = container.Labels["com.docker.compose.project"]
  return `${service}.${project}.svc.cluster.local`
}

function prohibitedNetworkMode(networkMode: string) {
  return [ "none", "host" ].includes(networkMode) ||
    networkMode.startsWith("container:") ||
    networkMode.startsWith("service:")
}

async function connectContainerToAppsNetwork(docker: Docker, container: Docker.ContainerInfo, network_name: string) {
  if (prohibitedNetworkMode(container.HostConfig.NetworkMode)) {
    logger.debug(`Container ${container.Id} is using network mode ${container.HostConfig.NetworkMode}, skipping`)
    return
  }

  const network = docker.getNetwork(network_name)
  const dnsName = getDnsName(container)

  logger.debug(`Connecting container ${container.Id} to network ${network_name} as ${dnsName}`)

  try {
    await network.connect({
      Container: container.Id,
      EndpointConfig: {
        Aliases: [ dnsName ]
      }
    })
  } catch (e: any) {
    logger.error(`Failed to connect container ${container.Id} to network ${network_name}:`, e)
    return
  }

  logger.info(`Container ${container.Id} (aka ${container.Names.join(", ")}) connected to network ${network_name} as ${dnsName}`)
}

function isContainerInNetwork(container: Docker.ContainerInfo, network_name: string) {
  return container.NetworkSettings.Networks[network_name] !== undefined
}

function isIxProjectName(name: string) {
  return name.startsWith("ix-")
}

function isIxAppContainer(container: Docker.ContainerInfo) {
  return isIxProjectName(container.Labels["com.docker.compose.project"])
}

function isNetworkSpecified(container: Docker.ContainerInfo) {
  return container.Labels["tj.horner.dragonify.networks"] !== undefined
}

async function connectAllContainersToAppsNetwork(docker: Docker) {
  logger.debug("Connecting existing app containers to network")

  const containers = await docker.listContainers({
    limit: -1,
    filters: {
      label: [ "com.docker.compose.project" ]
    }
  })

  const appContainers = containers.filter(isIxAppContainer)
  for (const container of appContainers) {
    if (isNetworkSpecified(container)) {
      const individualNetworks: string[] = container.Labels["tj.horner.dragonify.networks"].split(',')
      logger.info(`Connecting ${container.Names} to ${individualNetworks}`)

      for (let i = 0; i < individualNetworks.length; i++) {
        if (isContainerInNetwork(container, individualNetworks[i])) {
          logger.debug(`Container ${container.Id} already connected to network ${individualNetworks[i]}`)
          continue
        }

        await connectContainerToAppsNetwork(docker, container, individualNetworks[i])
      }

      logger.info(`${container.Names} is connected to all its networks`)
    }
  }

  logger.info("All configured app containers connected to their network")
}

async function connectNewContainerToAppsNetwork(docker: Docker, containerId: string) {
  const [ container ] = await docker.listContainers({
    filters: {
      id: [ containerId ]
    }
  })

  if (!container) {
    logger.warn(`Container ${containerId} not found`)
    return
  }

  if (isNetworkSpecified(container)) {
    const individualNetworks: string[] = container.Labels["tj.horner.dragonify.networks"].split(',')
    logger.info(`Connecting ${container.Names} to ${individualNetworks}`)

    for (let i = 0; i < individualNetworks.length; i++) {
      if (isContainerInNetwork(container, individualNetworks[i])) {
        logger.debug(`Container ${container.Id} already connected to network ${individualNetworks[i]}`)
        return
      }

      logger.debug(`New container started: ${container.Id}`)
      await connectContainerToAppsNetwork(docker, container, individualNetworks[i])
    }

    logger.info(`${container.Names} is connected to all its networks`)
  }
}






async function removeEmptyCreatedNetwork(docker: Docker, containerId: string) {

  const existingNetworks = await docker.listNetworks()
  for (let i = 0; i < existingNetworks.length; i++) {
    await docker.inspectNetwork({
      filters: JSON.stringify({
        labels: ['tj.horner.dragonify.networks'],
      }),
    })
    logger.info(`11111111111111111111 All Network are `)
  }
  for (let i = 0; i < existingNetworks.length; i++) {
    const dragonifyNetworks = await docker.inspectNetwork({
      filters: JSON.stringify({
        labels: ['tj.horner.dragonify.networks'],
      }),
    })
    logger.info(`22222222222222222 All Network are ${dragonifyNetworks}`)
  }
  if (existingNetworks.length === 1) {
    logger.info(`333333333333333333 All Network are ${existingNetworks}`)
  }

  else {
    logger.info(`44444444444444444444 All Network are ${existingNetworks}`)
      }
    }





async function main() {
  const docker = new Docker()

  await setUpNetwork(docker)
  await connectAllContainersToAppsNetwork(docker)

  const events = getEventStream(docker)
  events.on("container.start", (event) => {
    const containerAttributes = event.Actor.Attributes
    if (!isIxProjectName(containerAttributes["com.docker.compose.project"])) {
      return
    }

    connectNewContainerToAppsNetwork(docker, event.Actor["ID"])
  })

  events.on("container.stop", (event) => {
    const containerAttributes = event.Actor.Attributes
    if (!isIxProjectName(containerAttributes["com.docker.compose.project"])) {
      return
    }

    removeEmptyCreatedNetwork(docker, event.Actor["ID"])
  })
}

main()