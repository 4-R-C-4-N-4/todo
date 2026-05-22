#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { registerAnalyze } from "./commands/analyze.js";
import { registerClose } from "./commands/close.js";
import { registerDedup } from "./commands/dedup.js";
import { registerEdit } from "./commands/edit.js";
import { registerExport } from "./commands/export.js";
import { registerInit } from "./commands/init.js";
import { registerInstallHooks } from "./commands/install-hooks.js";
import { registerLink } from "./commands/link.js";
import { registerList } from "./commands/list.js";
import { registerNew } from "./commands/new.js";
import { registerNext } from "./commands/next.js";
import { registerScan } from "./commands/scan.js";
import { registerShow } from "./commands/show.js";
import { registerSync } from "./commands/sync.js";
import { registerTransition } from "./commands/transition.js";
import { registerWork } from "./commands/work.js";

// Read version from the package.json shipped alongside dist/. Avoids drift
// between the published npm version and what `todo --version` prints.
const pkg = JSON.parse(
	readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { version: string };

const program = new Command();
program
	.name("todo")
	.description("Git-native work tracking for coding agents")
	.version(pkg.version);

registerInit(program);
registerNew(program);
registerList(program);
registerShow(program);
registerExport(program);
registerEdit(program);
registerTransition(program);
registerClose(program);
registerWork(program);
registerNext(program);
registerAnalyze(program);
registerLink(program);
registerScan(program);
registerDedup(program);
registerInstallHooks(program);
registerSync(program);

program.parse(process.argv);
