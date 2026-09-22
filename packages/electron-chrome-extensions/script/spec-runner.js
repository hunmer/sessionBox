#!/usr/bin/env node

const childProcess = require('child_process')
const path = require('path')

require('colors')
const pass = '✓'.green
const fail = '✗'.red

async function main() {
  await runElectronTests()
}

async function runElectronTests() {
  const errors = []

  const testResultsDir = process.env.ELECTRON_TEST_RESULTS_DIR

  try {
    console.info('\nRunning:')
    if (testResultsDir) {
      process.env.MOCHA_FILE = path.join(testResultsDir, `test-results.xml`)
    }
    await runMainProcessElectronTests()
  } catch (err) {
    errors.push([err])
  }

  if (errors.length !== 0) {
    for (const err of errors) {
      console.error('\n\nRunner Failed:', err[0])
      console.error(err[1])
    }
    console.log(`${fail} Electron test runners have failed`)
    process.exit(1)
  }
}

async function runMainProcessElectronTests() {
  let exe = require('electron')
  const runnerArgs = ['spec', ...process.argv.slice(2).filter((arg) => arg !== '--')]

  // Fix issue in CI
  // "The SUID sandbox helper binary was found, but is not configured correctly."
  if (process.platform === 'linux') {
    runnerArgs.push('--no-sandbox')
  }

  const { status, signal } = childProcess.spawnSync(exe, runnerArgs, {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  })
  if (status !== 0) {
    if (status) {
      const textStatus =
        process.platform === 'win32' ? `0x${status.toString(16)}` : status.toString()
      console.log(`${fail} Electron tests failed with code ${textStatus}.`)
    } else {
      console.log(`${fail} Electron tests failed with kill signal ${signal}.`)
    }
    process.exit(1)
  }
  console.log(`${pass} Electron main process tests passed.`)
}

main().catch((error) => {
  console.error('An error occurred inside the spec runner:', error)
  process.exit(1)
})
