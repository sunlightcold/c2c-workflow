module.exports = function (options) {
  const parsed = Number(process.env.FORK_TS_CHECKER_MEMORY_LIMIT || 4096)
  const memoryLimit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4096

  if (!Array.isArray(options.plugins)) {
    return options
  }

  for (const plugin of options.plugins) {
    if (plugin?.constructor?.name !== 'ForkTsCheckerWebpackPlugin') {
      continue
    }

    plugin.options = {
      ...(plugin.options || {}),
      typescript: {
        ...((plugin.options && plugin.options.typescript) || {}),
        memoryLimit,
      },
    }
  }

  return options
}
