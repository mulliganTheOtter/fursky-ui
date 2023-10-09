import {AppBskyActorDefs} from '@atproto/api'
import {makeAutoObservable, runInAction} from 'mobx'
import sampleSize from 'lodash.samplesize'
import {bundleAsync} from 'lib/async/bundle'
import {RootStoreModel} from '../root-store'

export type RefWithInfoAndFollowers = AppBskyActorDefs.ProfileViewBasic & {
  followers: AppBskyActorDefs.ProfileView[]
}

export type ProfileViewFollows = AppBskyActorDefs.ProfileView & {
  follows: AppBskyActorDefs.ProfileViewBasic[]
}

export class FoafsModel {
  isLoading = false
  hasData = false
  sources: string[] = []
  foafs: Map<string, ProfileViewFollows> = new Map() // FOAF stands for Friend of a Friend
  popular: RefWithInfoAndFollowers[] = []

  constructor(public rootStore: RootStoreModel) {
    makeAutoObservable(this)
  }

  get hasContent() {
    if (this.popular.length > 0) {
      return true
    }
    for (const foaf of this.foafs.values()) {
      if (foaf.follows.length) {
        return true
      }
    }
    return false
  }

  fetch = bundleAsync(async () => {
    try {
      this.isLoading = true

      // fetch some of the user's follows
      await this.rootStore.me.follows.syncIfNeeded()

      // grab 10 of the users followed by the user
      runInAction(() => {
        this.sources = sampleSize(
          Object.keys(this.rootStore.me.follows.byDid),
          10,
        )
      })
      if (this.sources.length === 0) {
        return
      }
      runInAction(() => {
        this.foafs.clear()
        this.popular.length = 0
      })

      // fetch their profiles
      const profiles = await this.rootStore.agent.getProfiles({
        actors: this.sources,
      })

      // fetch their follows
      const results = await Promise.allSettled(
        this.sources.map(source =>
          this.rootStore.agent.getFollows({actor: source}),
        ),
      )

      // store the follows and construct a "most followed" set
      const popular: RefWithInfoAndFollowers[] = []
      for (let i = 0; i < results.length; i++) {
        const res = results[i]
        if (res.status === 'fulfilled') {
          this.rootStore.me.follows.hydrateMany(res.value.data.follows)
        }
        const profile = profiles.data.profiles[i]
        const source = this.sources[i]
        if (res.status === 'fulfilled' && profile) {
          // filter out inappropriate suggestions
          res.value.data.follows = res.value.data.follows.filter(follow => {
            const viewer = follow.viewer
            if (viewer) {
              if (
                viewer.following ||
                viewer.muted ||
                viewer.mutedByList ||
                viewer.blockedBy ||
                viewer.blocking
              ) {
                return false
              }
            }
            if (follow.did === this.rootStore.me.did) {
              return false
            }
            return true
          })

          runInAction(() => {
            this.foafs.set(source, {
              ...profile,
              follows: res.value.data.follows,
            })
          })
          for (const follow of res.value.data.follows) {
            let item = popular.find(p => p.did === follow.did)
            if (!item) {
              item = {...follow, followers: []}
              popular.push(item)
            }
            item.followers.push(profile)
          }
        }
      }

      popular.sort((a, b) => b.followers.length - a.followers.length)
      runInAction(() => {
        this.popular = popular.filter(p => p.followers.length > 1).slice(0, 20)
      })
      this.hasData = true
    } catch (e) {
      console.error('Failed to fetch FOAFs', e)
    } finally {
      runInAction(() => {
        this.isLoading = false
      })
    }
  })
}
