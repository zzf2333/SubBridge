#!/usr/bin/env bun
import { Command } from 'commander';
import { runConvert } from './commands/convert';
import { runValidate } from './commands/validate';
import { runVerify } from './commands/verify';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../meta';

const program = new Command();

program
    .name('subbridge')
    .description(`${APP_NAME}: ${APP_TAGLINE}`)
    .version(APP_VERSION);

program
    .command('convert')
    .description('Migrate Clash config to sing-box config')
    .option('-i, --input <file>', 'Input Clash YAML file')
    .option('-u, --url <url>', 'Clash subscription URL')
    .option('-o, --output <file>', 'Output sing-box JSON file')
    .option('-r, --report <file>', 'Write migration report JSON file')
    .option('--report-display <file>', 'Write report display JSON file')
    .option(
        '--report-mode <mode>',
        'Console report mode: auto|none|summary|highlights|full',
        'auto'
    )
    .option('--no-provider-fetch', 'Disable remote provider cache refresh before migration')
    .option(
        '--provider-fetch-timeout <ms>',
        'Timeout for each remote provider fetch in milliseconds',
        '4000'
    )
    .option('--provider-fetch-scope <scope>', 'Provider fetch scope: proxy|rule|all', 'all')
    .option('--provider-fetch-force', 'Force refresh remote provider cache', false)
    .option('-a, --artifacts <dir>', 'Write intermediate artifacts JSON files to directory')
    .option('--pretty', 'Pretty-print output JSON', false)
    .option('--check', 'Validate configuration after conversion', false)
    .action(runConvert);

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
    .action(runVerify);

program.parse();
