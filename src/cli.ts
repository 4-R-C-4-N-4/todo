#!/usr/bin/env node
import { Command } from "commander";
import { registerAnalyze } from "./commands/analyze.js";
import { registerClose } from "./commands/close.js";
import { registerDedup } from "./commands/dedup.js";
import { registerEdit } from "./commands/edit.js";
import { registerExport } from "./commands/export.js";
import { registerInit } from "./commands/init.js";
import { registerLink } from "./commands/link.js";
import { registerList } from "./commands/list.js";
import { registerNew } from "./commands/new.js";
import { registerScan } from "./commands/scan.js";
import { registerShow } from "./commands/show.js";
import { registerTransition } from "./commands/transition.js";
import { registerWork } from "./commands/work.js";

const program = new Command();
program
	.name("todo")
	.description("Git-native work tracking for coding agents")
	.version("1.0.0");

registerInit(program);
registerNew(program);
registerList(program);
registerShow(program);
registerExport(program);
registerEdit(program);
registerTransition(program);
registerClose(program);
registerWork(program);
registerAnalyze(program);
registerLink(program);
registerScan(program);
registerDedup(program);

program.parse(process.argv);
