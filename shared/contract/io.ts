import YAML from 'yaml';
import type { AnyEntity } from '../types';
import { entityToGenerator } from '../generatorMap';

export function designToYaml(e: AnyEntity): string {
  return YAML.stringify(e);
}

export function designFromYaml(text: string): AnyEntity {
  return YAML.parse(text) as AnyEntity;
}

export function designToGeneratorJson(e: AnyEntity): string {
  return JSON.stringify(entityToGenerator(e), null, 2);
}
