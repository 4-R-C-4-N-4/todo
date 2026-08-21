import { describe, expect, it } from "vitest";
import { findDuplicates } from "../src/dedup.js";
import { makeTicket } from "./helpers.js";

const fp = (id: string, fingerprint: string) =>
	makeTicket({
		id,
		source: { type: "log", traceback_fingerprint: fingerprint },
	});

const withFile = (id: string, path: string, lines?: [number, number]) =>
	makeTicket({ id, files: [{ path, ...(lines ? { lines } : {}) }] });

describe("findDuplicates — fingerprint strategy", () => {
	it("pairs two tickets sharing a traceback fingerprint", () => {
		const pairs = findDuplicates(
			[fp("a1", "deadbeefcafe"), fp("b2", "deadbeefcafe")],
			"fingerprint",
		);
		expect(pairs).toHaveLength(1);
		expect(pairs[0]).toMatchObject({
			ticket1: "a1",
			ticket2: "b2",
			strategy: "fingerprint",
		});
	});

	it("emits every pair in a group of three (C(3,2) = 3)", () => {
		const pairs = findDuplicates(
			[fp("a", "x"), fp("b", "x"), fp("c", "x")],
			"fingerprint",
		);
		expect(pairs).toHaveLength(3);
	});

	it("does not pair different fingerprints", () => {
		expect(
			findDuplicates([fp("a", "x"), fp("b", "y")], "fingerprint"),
		).toHaveLength(0);
	});

	it("ignores tickets with a missing or empty fingerprint", () => {
		expect(
			findDuplicates([makeTicket({ id: "a" }), fp("b", "")], "fingerprint"),
		).toHaveLength(0);
	});
});

describe("findDuplicates — file-line strategy", () => {
	it("pairs tickets touching the same file with overlapping lines", () => {
		const pairs = findDuplicates(
			[
				withFile("a", "src/x.ts", [10, 20]),
				withFile("b", "src/x.ts", [15, 25]),
			],
			"file-line",
		);
		expect(pairs).toHaveLength(1);
		expect(pairs[0]).toMatchObject({
			ticket1: "a",
			ticket2: "b",
			strategy: "file-line",
		});
	});

	it("treats touching ranges (a.end === b.start) as overlap", () => {
		expect(
			findDuplicates(
				[withFile("a", "x", [10, 15]), withFile("b", "x", [15, 20])],
				"file-line",
			),
		).toHaveLength(1);
	});

	it("does not pair non-overlapping ranges in the same file", () => {
		expect(
			findDuplicates(
				[withFile("a", "x", [1, 5]), withFile("b", "x", [6, 9])],
				"file-line",
			),
		).toHaveLength(0);
	});

	it("does not pair identical ranges in different files", () => {
		expect(
			findDuplicates(
				[withFile("a", "x", [1, 5]), withFile("b", "y", [1, 5])],
				"file-line",
			),
		).toHaveLength(0);
	});

	it("ignores file references that carry no line range", () => {
		expect(
			findDuplicates([withFile("a", "x"), withFile("b", "x")], "file-line"),
		).toHaveLength(0);
	});

	it("returns nothing for an empty ticket list", () => {
		expect(findDuplicates([], "file-line")).toEqual([]);
	});
});
