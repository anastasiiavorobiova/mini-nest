import "reflect-metadata";
import { Injectable } from "./injectable.js";

export const CONTROLLER_PATH_KEY = Symbol("controller_path");

export function Controller(prefix: string): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata(CONTROLLER_PATH_KEY, prefix, target);
    Injectable()(target);
  };
}

export function isController(target: Function): boolean {
  return Reflect.hasOwnMetadata(CONTROLLER_PATH_KEY, target);
}
