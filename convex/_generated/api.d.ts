/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bookProgress from "../bookProgress.js";
import type * as books from "../books.js";
import type * as crons from "../crons.js";
import type * as dateUtils from "../dateUtils.js";
import type * as readingSessions from "../readingSessions.js";
import type * as reminders from "../reminders.js";
import type * as remindersSend from "../remindersSend.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bookProgress: typeof bookProgress;
  books: typeof books;
  crons: typeof crons;
  dateUtils: typeof dateUtils;
  readingSessions: typeof readingSessions;
  reminders: typeof reminders;
  remindersSend: typeof remindersSend;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
