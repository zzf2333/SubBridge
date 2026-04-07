#!/usr/bin/env node
import { Command } from 'commander';
import { runValidate } from './commands/validate';
import { runVerify } from './commands/verify';
import { buildCommand } from './commands/build';
import { initCommand } from './commands/init';
import { serveCommand } from './commands/serve';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../meta';

const program = new Command();

program
    .name('subbridge')
    .description(`${APP_NAME}: ${APP_TAGLINE}`)
    .version(APP_VERSION);

program
    .command('validate')
    .description('Validate a sing-box configuration file')
    .requiredOption('-i, --input <file>', 'sing-box JSON config file')
    .option('--with-singbox', 'Also validate with sing-box check command', false)
    .action(runValidate);

program
    .command('verify')
    .description('Verify a generated sing-box configuration end-to-end')
    .requiredOption('-i, --input <file>', 'sing-box JSON config file')
    .option('-r, --report <file>', 'Write verification report JSON file')
    .option('--no-singbox-check', 'Skip sing-box check')
    .option('--no-smoke', 'Skip proxy smoke validation')
    .option('--proxy <url>', 'Local proxy URL for smoke validation', 'http://127.0.0.1:7893')
    .option('--bin <path>', 'sing-box binary path', 'sing-box')
    .option('--keep-tun', 'Keep original tun inbound during smoke validation', false)
    .option('--keep-tmp', 'Keep smoke temp files and logs', false)
    .action(async (...args) => { await runVerify(...(args as Parameters<typeof runVerify>)); });

program.addCommand(buildCommand());
program.addCommand(initCommand());
program.addCommand(serveCommand());

program.parse();
