import { ConfigurationChangeEvent, workspace } from "vscode"

export const EXTENSION_CONFIG_KEY = "tsmc"

export enum ConfigurationKeys {
  mockLocation = "mockLocation",
}

export class Configuration {
  private configs = {
    mockLocation: new SingletonConfigValue<string>(ConfigurationKeys.mockLocation),
  }

  constructor() {
    workspace.onDidChangeConfiguration(this.onConfigChange, this)
  }

  private onConfigChange(event: ConfigurationChangeEvent) {
    if (event.affectsConfiguration(EXTENSION_CONFIG_KEY)) {
      Object.values(this.configs).forEach((config) => config.renew())
    }
  }

  public getMockLocation(): string {
    return this.configs.mockLocation.get()
  }
}

class SingletonConfigValue<T> {
  private value: T | undefined

  constructor(private key: string) {
    this.value = this.getConfigValue()
  }

  private getConfigValue(): T | undefined {
    return workspace.getConfiguration(EXTENSION_CONFIG_KEY).get<T>(this.key)
  }

  public renew() {
    this.value = this.getConfigValue()
  }

  public get(): T {
    return this.value!
  }

  public getKey(): string {
    return `${EXTENSION_CONFIG_KEY}.${this.key}`
  }
}

export const configuration = new Configuration()
