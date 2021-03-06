"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const axios_1 = __importDefault(require("axios"));
const path_1 = require("path");
const fs_1 = require("fs");
const semver_diff_1 = __importDefault(require("semver-diff"));
const semver_regex_1 = __importDefault(require("semver-regex"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const pubspecFileName = core.getInput('file-name') || 'pubspec.yaml', dir = process.env.GITHUB_WORKSPACE || '/github/workspace', eventFile = process.env.GITHUB_EVENT_PATH || '/github/workflow/event.json', token = core.getInput('token');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const eventObj = yield readJson(eventFile);
        return yield processDirectory(dir, eventObj.commits);
    });
}
function isPubspecObj(value) {
    return !!value && !!value.version;
}
function getCommit(sha) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits/${sha}`;
        const headers = token ? {
            Authorization: `Bearer ${token}`
        } : undefined;
        return (yield axios_1.default.get(url, { headers })).data;
    });
}
function checkCommits(commits, version) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            for (const commit of commits) {
                if (yield checkDiff(commit.id, version)) {
                    console.log(`Found match for version ${version}: ${commit.id.substring(0, 7)} ${commit.message}`);
                    return true;
                }
            }
            console.log('No matching commit found.');
            return false;
        }
        catch (e) {
            core.setFailed(e);
        }
    });
}
function checkDiff(sha, version) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const commit = yield getCommit(sha);
            const pbs = commit.files.find(f => f.filename == pubspecFileName);
            if (!pbs)
                return false;
            const versionLines = {};
            const rawLines = pbs.patch.split('\n')
                .filter(line => line.includes('version:') && ['+', '-'].includes(line[0]));
            if (rawLines.length > 2)
                return false;
            for (const line of rawLines)
                versionLines[line.startsWith('+') ? 'added' : 'deleted'] = line;
            if (!versionLines.added)
                return false;
            const versions = {
                added: matchVersion(versionLines.added),
                deleted: !!versionLines.deleted && matchVersion(versionLines.deleted)
            };
            if (versions.added != version)
                return false;
            setOutput('changed', true);
            setOutput('version', version);
            if (versions.deleted)
                setOutput('type', semver_diff_1.default(versions.deleted, versions.added));
            return true;
        }
        catch (e) {
            console.error(`An error occurred in checkDiff:\n${e}`);
            throw new ExitError(1);
        }
    });
}
function matchVersion(str) {
    return ((str.match(/[0-9.]+/g) || [])
        .map(s => s.match(semver_regex_1.default()))
        .find(e => !!e) || [])[0];
}
function processDirectory(dir, commits) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const pubspecFile = path_1.join(dir, pubspecFileName), pubspecObj = yield readYaml(pubspecFile).catch(() => {
                Promise.reject(new NeutralExitError(`Pubspec file not found: ${pubspecFile}`));
            });
            if (!isPubspecObj(pubspecObj))
                throw new Error('Can\'t find version field');
            if (commits.length >= 20)
                console.warn('This workflow run topped the commit limit set by GitHub webhooks: that means that commits could not appear and that the run could not find the version change.');
            yield checkCommits(commits, pubspecObj.version);
        }
        catch (e) {
            core.setFailed(e);
        }
    });
}
function readJson(file) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield new Promise((resolve, reject) => fs_1.readFile(file, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        }));
        return JSON.parse(data);
    });
}
function readYaml(file) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield new Promise((resolve, reject) => fs_1.readFile(file, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        }));
        return js_yaml_1.default.load(data);
    });
}
function setOutput(name, value) {
    return core.setOutput(name, `${value}`);
}
// #region Error classes
class ExitError extends Error {
    constructor(code) {
        super(`Command failed with code ${code}`);
        if (typeof code == 'number')
            this.code = code;
    }
}
class NeutralExitError extends Error {
}
// #endregion
if (require.main == module) {
    console.log('Searching for version update...');
    main().catch(e => {
        if (e instanceof NeutralExitError)
            process.exitCode = 78;
        else {
            process.exitCode = 1;
            console.error(e.message || e);
        }
    });
}
