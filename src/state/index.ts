import {autorun} from 'mobx'
import {AdxClient, blueskywebSchemas} from '@adxp/mock-api'
import {RootStoreModel} from './models/root-store'
import * as libapi from './lib/api'
import * as storage from './lib/storage'
// import * as auth from './auth' TODO

const ROOT_STATE_STORAGE_KEY = 'root'

export async function setupState() {
  let rootStore: RootStoreModel
  let data: any

  const api = new AdxClient({
    pds: 'http://localhost',
    schemas: blueskywebSchemas,
  })
  await libapi.setup(api)
  rootStore = new RootStoreModel(api)
  try {
    data = (await storage.load(ROOT_STATE_STORAGE_KEY)) || {}
    rootStore.hydrate(data)
  } catch (e) {
    console.error('Failed to load state from storage', e)
  }

  // track changes & save to storage
  autorun(() => {
    const snapshot = rootStore.serialize()
    console.log('saving', snapshot)
    storage.save(ROOT_STATE_STORAGE_KEY, snapshot)
  })

  // TODO
  rootStore.session.setAuthed(true)
  // if (env.authStore) {
  //   const isAuthed = await auth.isAuthed(env.authStore)
  //   rootStore.session.setAuthed(isAuthed)

  //   // handle redirect from auth
  //   if (await auth.initialLoadUcanCheck(env.authStore)) {
  //     rootStore.session.setAuthed(true)
  //   }
  // }
  await rootStore.me.load()
  console.log(rootStore.me)

  return rootStore
}

export {useStores, RootStoreModel, RootStoreProvider} from './models/root-store'