// @flow

import { Container } from 'inversify'

import type { ShelleyTxType } from '../blockchain/shelley/tx'
import type { TxType as ByronTxType } from '../blockchain/common'

import type {
  StorageProcessor,
  Database,
  NetworkConfig,
} from '../interfaces'

import SERVICE_IDENTIFIER from '../constants/identifiers'
import { NETWORK_PROTOCOL } from '../entities/network-config'
import {
  PostgresStorageProcessor,
  ElasticShelleyStorageProcessor,
  ElasticByronStorageProcessor,
  DBByron,
  DBShelley,
} from '../entities'

export const SEIZA_ELASTIC = 'seiza-elastic'
export const YOROI_POSTGRES = 'yoroi-postgres'

const initDbProvider = (container: Container, networkProtocol: string): void => {
  if (networkProtocol === NETWORK_PROTOCOL.BYRON) {
    container.bind<Database<ByronTxType>>(SERVICE_IDENTIFIER.DATABASE)
      .to(DBByron)
      .inSingletonScope()
  } else if (networkProtocol === NETWORK_PROTOCOL.SHELLEY) {
    container.bind<Database<ShelleyTxType>>(SERVICE_IDENTIFIER.DATABASE)
      .to(DBShelley)
      .inSingletonScope()
  } else {
    throw new Error(`Protocol: ${networkProtocol} not supported.`)
  }
}

const initStorageProcessor = (container: Container): void => {
  const networkConfig = container.get<NetworkConfig>(SERVICE_IDENTIFIER.NETWORK_CONFIG)
  const networkProtocol = networkConfig.networkProtocol()
  const storageName = container.getNamed('storageProcessor')
  const storageBind = container.bind<StorageProcessor>(SERVICE_IDENTIFIER.STORAGE_PROCESSOR)
  if (storageName === YOROI_POSTGRES) {
    initDbProvider(container, networkProtocol)
    storageBind.to(PostgresStorageProcessor).inSingletonScope()
  } else if (storageName === SEIZA_ELASTIC) {
    if (networkProtocol === NETWORK_PROTOCOL.BYRON) {
      storageBind.to(ElasticByronStorageProcessor).inSingletonScope()
    } else {
      storageBind.to(ElasticShelleyStorageProcessor).inSingletonScope()
    }
  } else {
    throw new Error(`Storage: ${storageName} not supported.`)
  }
}

export default initStorageProcessor
