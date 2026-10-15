// -----------------------------------------------------------------------------
// Repeated failures, logged once.
//
// A refresh that fails every hour, a logo that never downloads: each would
// write the same warning again and again. An issue log keeps, per key,
// whether the problem is ongoing: the first failure is a warning, the next
// ones go to debug, and the recovery is one info line.
// (Same pattern as guim31/gladys-subsonic.)
// -----------------------------------------------------------------------------

/**
 * @param {{ debug: Function, info: Function, warn: Function }} logger
 */
export function createIssueLog(logger) {
  const ongoing = new Set();
  return {
    /**
     * Report a failure: a warning the first time, debug while it lasts.
     * @returns {boolean} true when this failure starts a new issue
     */
    fail(key, message) {
      if (ongoing.has(key)) {
        logger.debug(`${message} (still failing)`);
        return false;
      }
      ongoing.add(key);
      logger.warn(message);
      return true;
    },

    /**
     * Report a success: one info line when it ends an ongoing failure.
     * @returns {boolean} true when this success ends an issue
     */
    ok(key, message) {
      if (ongoing.delete(key)) {
        logger.info(message);
        return true;
      }
      return false;
    },

    isFailing(key) {
      return ongoing.has(key);
    },
  };
}
