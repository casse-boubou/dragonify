import Docker from "dockerode"
import { getEventStream } from "./docker-events"
import { logger } from "./logger"

const NETWORK_NAME = "apps-internal"
const CONNECT_ALL_ENABLE: string | undefined = process.env.CONNECT_ALL
const CUSTOM_NETWORK_NAMES: string | undefined = process.env.CUSTOMS_NETWORKS


if (CONNECT_ALL_ENABLE !== undefined) {
  var CONNECT_ALL: string | undefined = CONNECT_ALL_ENABLE.toLowerCase( )
}
else {
  var CONNECT_ALL: string | undefined = "false"
}
var networks_liste: string[] = [NETWORK_NAME]
if (CUSTOM_NETWORK_NAMES !== undefined) {
  var networks_liste: string[] = CUSTOM_NETWORK_NAMES.split(',')
}
else {
  var networks_liste: string[] = []
}








async function setUpNetwork(docker: Docker) {
  const networkList:string[] = []
  if (CONNECT_ALL !== "false" ) {
    logger.info(`${NETWORK_NAME} will be created for connect all your containers`)
    networkList.push(NETWORK_NAME)
  }
  else {
    const existingNetworks = await docker.listNetworks()
    const NETWORK_NAME_exist = existingNetworks.filter((thisnetwork: any) => thisnetwork.Name?.[NETWORK_NAME]).length === 1
    if (NETWORK_NAME_exist) {
      const network_to_remove = Object.keys(existingNetworks.filter((thisnetwork: any) => thisnetwork.Name?.[NETWORK_NAME]))
      const network = await docker.getNetwork(network_to_remove.Id).inspect()
      const containers = network.Containers ?? {}

      for (let i = 0; i < containers.length; i++) {
        await docker.getNetwork(network.Id).disconnect(containers[i])
      }

      logger.info(`Network "${network.Name}" is now empty and will be deleted.`)
      await docker.getNetwork(network.Id).remove()


    }

  }

  for (let i = 0; i < networks_liste.length; i++) {
    networkList.push(networks_liste[i])
  }

  for (let i = 0; i < networkList.length; i++) {
    logger.info(`Setting up network ${networkList[i]}`)

    const existingNetworks = await docker.listNetworks({filters: {name: [networkList[i]]}})
    if (existingNetworks.length === 1) {
      logger.info(`Network ${networkList[i]} already exists`)
    }

    else {
      await docker.createNetwork({
        Name: networkList[i],
        Driver: "bridge",
        Internal: true,
        Labels: {
          "tj.horner.dragonify.networks": "true"
        },
      })

      logger.info(`Network ${networkList[i]} created`)
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

  const isExistingNetwork = await docker.listNetworks({filters: {name: [network_name]}})
  if (isExistingNetwork.length !== 1) {
    logger.info(`Network ${network_name} need by ${container.Names} don't exists yet, creating...`)
    await docker.createNetwork({
      Name: network_name,
      Driver: "bridge",
      Internal: true,
      Labels: {
        "tj.horner.dragonify.networks": "true"
      },
    })

    logger.info(`Network ${network_name} created`)
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
    const networkList:string[] = []
    if (CONNECT_ALL !== "false" ) {
      logger.info(`${container.Names} will be connected to all others`)
      networkList.push(NETWORK_NAME)
    }
    if (isNetworkSpecified(container)) {
      const individualNetworks: string[] = container.Labels["tj.horner.dragonify.networks"].split(',')

      for (let i = 0; i < individualNetworks.length; i++) {
        networkList.push(individualNetworks[i])
      }
    }

    for (let i = 0; i < networkList.length; i++) {
      if (isContainerInNetwork(container, networkList[i])) {
        logger.debug(`Container ${container.Id} already connected to network ${networkList[i]}`)
        continue
      }
      logger.info(`Connecting ${container.Names} to ${networkList[i]}`)
      await connectContainerToAppsNetwork(docker, container, networkList[i])
    }

    logger.info(`${container.Names} is connected to all its networks`)
    
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

  logger.debug(`New container started: ${container.Id}`)

  const networkList:string[] = []
  if (CONNECT_ALL !== "false" ) {
    logger.info(`${container.Names} will be connected to all others`)
    networkList.push(NETWORK_NAME)
  }
  if (isNetworkSpecified(container)) {
    const individualNetworks: string[] = container.Labels["tj.horner.dragonify.networks"].split(',')

    for (let i = 0; i < individualNetworks.length; i++) {
      networkList.push(individualNetworks[i])
    }
  }

  for (let i = 0; i < networkList.length; i++) {
    if (isContainerInNetwork(container, networkList[i])) {
      logger.debug(`Container ${container.Id} already connected to network ${networkList[i]}`)
      return
    }

    logger.info(`Connecting ${container.Names} to ${networkList[i]}`)
    await connectContainerToAppsNetwork(docker, container, networkList[i])
  }

  logger.info(`${container.Names} is connected to all its networks`)
}









async function removeEmptyCreatedNetwork(docker: Docker) {
  const existingNetworks = await docker.listNetworks()
  const dragonifyNetworks = existingNetworks.filter((thisnetwork: any) => thisnetwork.Labels?.["tj.horner.dragonify.networks"])

  for (const networkSummary of dragonifyNetworks) {
    const network = await docker.getNetwork(networkSummary.Id).inspect()
    const containers = network.Containers ?? {}
    const isEmpty = Object.keys(containers).length === 0
    
    if (isEmpty) {
      logger.info(`Network "${network.Name}" is now empty and will be deleted.`)
      await docker.getNetwork(network.Id).remove()
    }
    else {
      logger.debug(`Network "${network.Name}" contains containers : ${Object.keys(containers).join(", ")}`)
    }
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

    removeEmptyCreatedNetwork(docker)
  })
}

main()
