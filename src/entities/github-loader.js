// @flow

import type { Logger } from 'bunyan'
import { helpers } from 'inversify-vanillajs-helpers'

import type {
  Scheduler,
  StorageProcessor,
} from '../interfaces'
import SERVICE_IDENTIFIER from '../constants/identifiers'
import GitHubApi from "./github-api";

const ERROR_META = {
}

class GitHubLoader implements Scheduler {

  storageProcessor: StorageProcessor

  gitHubApi: GitHubApi

  logger: Logger

  checkGitHubMillis: number

  constructor(
    checkGitHubSeconds: number,
    storageProcessor: StorageProcessor,
    gitHubApi: GitHubApi,
    logger: Logger,
  ) {
    this.storageProcessor = storageProcessor
    this.gitHubApi = gitHubApi
    this.checkGitHubMillis = checkGitHubSeconds * 1000
    logger.debug('Checking GitHub every', checkGitHubSeconds, 'seconds')
    this.logger = logger
  }

  async checkGitHub() {
    this.logger.debug('>>>> Checking GitHub <<<<')
    const prs = await this.gitHubApi.getClosedPullRequests(1)
    this.logger.debug(`PRs:`, prs.length)
  }

  async startAsync() {
    this.logger.info('GitHub loader async: starting chain syncing loop')
    const currentMillis = () => new Date().getTime()
    const sleep = millis => new Promise(resolve => setTimeout(resolve, millis))
    for (;;) {
      const millisStart = currentMillis()
      let errorSleep = 0
      try {
        await this.checkGitHub()
      } catch (e) {
        const meta = ERROR_META[e.name]
        if (meta) {
          errorSleep = meta.sleep
          this.logger.warn(`Scheduler async: failed to check GitHub :: ${meta.msg}. Sleeping and retrying (err_sleep=${errorSleep})`)
        } else {
          throw e
        }
      }
      const millisEnd = currentMillis()
      const millisPassed = millisEnd - millisStart
      this.logger.debug(`GitHub loader async: loop finished (millisPassed=${millisPassed})`)
      const millisSleep = errorSleep || (this.checkGitHubMillis - millisPassed)
      if (millisSleep > 0) {
        this.logger.debug('GitHub loader async: sleeping for', millisSleep)
        await sleep(millisSleep)
      }
    }
  }
}

helpers.annotate(GitHubLoader,
  [
    'checkGitHubSeconds',
    SERVICE_IDENTIFIER.STORAGE_PROCESSOR,
    SERVICE_IDENTIFIER.GITHUB_API,
    SERVICE_IDENTIFIER.LOGGER,
  ])

export default GitHubLoader
