#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program.name('todo').description('Git-native work tracking for coding agents').version('1.0.0');
program.parse(process.argv);
