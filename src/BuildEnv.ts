import fs from 'fs';
import os from 'os';
import path from 'path';
import * as utils from './utils.js';
import log from 'npmlog';
import { highlight } from './utils';
import crypto from 'crypto';

/**
 * options as usable in opencv4nodejs section from package.json
 * Middle priority values
 */
export interface OpenCVPackageBuildOptions {
    autoBuildBuildCuda?: string;
    autoBuildFlags?: string;
    autoBuildOpencvVersion?: string;
    autoBuildWithoutContrib?: string;
    disableAutoBuild?: string;
    opencvIncludeDir?: string;
    opencvLibDir?: string;
    opencvBinDir?: string;
}

/**
 * options passed to OpenCVBuildEnv constructor
 * highest priority values
 */
export interface OpenCVParamBuildOptions {
    version?: string;
    autoBuildBuildCuda?: boolean;
    autoBuildWithoutContrib?: boolean;
    disableAutoBuild?: boolean;
    autoBuildFlags?: string;
    rootcwd?: string;
    opencvIncludeDir?: string;
    opencvLibDir?: string;
    opencvBinDir?: string;
}

type CommonKey = keyof OpenCVParamBuildOptions & keyof OpenCVPackageBuildOptions;

export class OpenCVBuildEnv {
    public opencvVersion: string;
    public buildWithCuda: boolean = false;
    public isWithoutContrib: boolean = false;
    public isAutoBuildDisabled: boolean = false;
    // root path to look for package.json opencv4nodejs section
    // deprecated directly infer your parameters to the constructor
    public autoBuildFlags: string;
    public rootcwd: string;

    private resolveValue(opts: OpenCVParamBuildOptions, packageEnv: OpenCVPackageBuildOptions, key: CommonKey, envName: string): string {
        if (key in opts) {
            if (typeof opts[key] === 'boolean') {
                return opts[key] ? '1' : '';
            } else
                return opts[key] as string || '';
        } else {
            if (packageEnv[key]) {
                return packageEnv[key] || '';
            } else {
                return process.env[envName] || '';
            }
        }
    }

    constructor(opts?: OpenCVParamBuildOptions) {
        opts = opts || {};
        if (opts.version) {
            this.opencvVersion = opts.version;
        } else {
            const DEFAULT_OPENCV_VERSION = '3.4.16'
            const { OPENCV4NODEJS_AUTOBUILD_OPENCV_VERSION } = process.env;
            if (!OPENCV4NODEJS_AUTOBUILD_OPENCV_VERSION) {
                log.info('init', `${utils.highlight("OPENCV4NODEJS_AUTOBUILD_OPENCV_VERSION")} is not defined using default verison ${utils.formatNumber(DEFAULT_OPENCV_VERSION)}`)
            } else {
                log.info('init', `${utils.highlight("OPENCV4NODEJS_AUTOBUILD_OPENCV_VERSION")} is defined using verison ${utils.formatNumber(OPENCV4NODEJS_AUTOBUILD_OPENCV_VERSION)}`)
            }
            this.opencvVersion = OPENCV4NODEJS_AUTOBUILD_OPENCV_VERSION || DEFAULT_OPENCV_VERSION;
        }
        // get project Root path to looks for package.json for opencv4nodejs section
        if (process.env.INIT_CWD) {
            log.info('init', `${utils.highlight("INIT_CWD")} is defined overwriting root path to  ${utils.highlight(process.env.INIT_CWD)}`)
        }
        this.rootcwd = opts.rootcwd || process.env.INIT_CWD || process.cwd()
        if (!fs.existsSync(this.rootcwd)) {
            throw new Error(`${this.rootcwd} does not exist`)
        }

        let packageEnv: OpenCVPackageBuildOptions = {};
        try {
            packageEnv = this.readEnvsFromPackageJson()
        } catch (err) {
            log.error('applyEnvsFromPackageJson', 'failed to parse package.json:')
            log.error('applyEnvsFromPackageJson', err)
        }

        const envKeys = Object.keys(packageEnv)
        if (envKeys.length) {
            log.info('applyEnvsFromPackageJson', 'the following opencv4nodejs environment variables are set in the package.json:')
            envKeys.forEach((key: keyof OpenCVPackageBuildOptions) => log.info('applyEnvsFromPackageJson', `${highlight(key)}: ${utils.formatNumber(packageEnv[key] || '')}`))
        }

        this.autoBuildFlags = this.resolveValue(opts, packageEnv, 'autoBuildFlags', 'OPENCV4NODEJS_AUTOBUILD_FLAGS');
        this.buildWithCuda = !!this.resolveValue(opts, packageEnv, 'autoBuildBuildCuda', 'OPENCV4NODEJS_BUILD_CUDA');
        this.isWithoutContrib = !!this.resolveValue(opts, packageEnv, 'autoBuildWithoutContrib', 'OPENCV4NODEJS_AUTOBUILD_WITHOUT_CONTRIB');
        this.isAutoBuildDisabled = !!this.resolveValue(opts, packageEnv, 'disableAutoBuild', 'OPENCV4NODEJS_DISABLE_AUTOBUILD');

        const OPENCV_INCLUDE_DIR = this.resolveValue(opts, packageEnv, 'opencvIncludeDir', 'OPENCV_INCLUDE_DIR');
        if (OPENCV_INCLUDE_DIR && process.env.OPENCV_INCLUDE_DIR !== OPENCV_INCLUDE_DIR) {
            process.env.OPENCV_INCLUDE_DIR = OPENCV_INCLUDE_DIR;
        }
        const OPENCV_LIB_DIR = this.resolveValue(opts, packageEnv, 'opencvLibDir', 'OPENCV_LIB_DIR');
        if (OPENCV_LIB_DIR && process.env.OPENCV_LIB_DIR !== OPENCV_LIB_DIR) {
            process.env.OPENCV_LIB_DIR = OPENCV_LIB_DIR;
        }

        const OPENCV_BIN_DIR = this.resolveValue(opts, packageEnv, 'opencvBinDir', 'OPENCV_BIN_DIR');
        if (OPENCV_BIN_DIR && process.env.OPENCV_BIN_DIR !== OPENCV_BIN_DIR) {
            process.env.OPENCV_BIN_DIR = OPENCV_BIN_DIR;
        }
    }


    public get opencvIncludeDir(): string {
        return process.env.OPENCV_INCLUDE_DIR || '';
    }

    // public get opencvLibDir(): string {
    //     return process.env.OPENCV_LIB_DIR || '';
    // }

    // public get opencvBinDir(): string {
    //     return process.env.OPENCV_BIN_DIR || '';
    // }


    public parseAutoBuildFlags(): string[] {
        const flagStr = this.autoBuildFlags
        if (typeof (flagStr) === 'string' && flagStr.length) {
            log.silly('install', 'using flags from OPENCV4NODEJS_AUTOBUILD_FLAGS:', flagStr)
            return flagStr.split(' ')
        }
        return []
    }

    /**
     * extract opencv4nodejs section from package.json if available
     */
    private parsePackageJson(): { file: string, data: any } | null {
        const absPath = path.resolve(this.rootcwd, 'package.json')
        if (!fs.existsSync(absPath)) {
            return null
        }
        log.info('config', `looking for opencv4nodejs option from ${highlight("%s")}`, absPath);
        const data = JSON.parse(fs.readFileSync(absPath).toString())
        return { file: absPath, data };
    }

    public numberOfCoresAvailable(): number { return os.cpus().length }

    /**
     * get opencv4nodejs section from package.json if available
     * @returns opencv4nodejs customs
     */
    private readEnvsFromPackageJson(): { [key: string]: string | boolean | number } {
        const rootPackageJSON = this.parsePackageJson()
        if (rootPackageJSON && rootPackageJSON.data) {
            if (rootPackageJSON.data.opencv4nodejs) {
                log.info('config', `found opencv4nodejs section in ${highlight(rootPackageJSON.file)}`);
                return rootPackageJSON.data.opencv4nodejs
            } else {
                log.info('config', `no opencv4nodejs section found in ${highlight(rootPackageJSON.file)}`);
            }
        }
        return {};
    }
    /**
     * openCV uniq version prostfix, used to avoid build path colision.
     */
    private logOnce = false;
    get optHash(): string {
        let optArgs = this.autoBuildFlags;
        if (!this.logOnce) {
            if (!optArgs) {
                log.info('init', `${utils.highlight("OPENCV4NODEJS_AUTOBUILD_FLAGS")} is not defined, No extra flags will be append to the build command`)
            } else {
                log.info('init', `${utils.highlight("OPENCV4NODEJS_AUTOBUILD_FLAGS")} is defined, as ${utils.formatNumber("%s")}`, optArgs);
            }
            this.logOnce = true;
        }
        if (this.buildWithCuda) optArgs += 'cuda'
        if (this.isWithoutContrib) optArgs += 'noContrib'
        if (optArgs) {
            optArgs = '-' + crypto.createHash('md5').update(optArgs).digest('hex').substring(0, 5);
        }
        return optArgs;
    }

    get rootDir(): string {
        // const __filename = fileURLToPath(import.meta.url);
        // const __dirname = dirname(__filename);
        return path.resolve(__dirname, '../');
    }
    get opencvRoot(): string {
        return path.join(this.rootDir, `opencv-${this.opencvVersion}${this.optHash}`)
    }
    get opencvSrc(): string {
        return path.join(this.opencvRoot, 'opencv')
    }
    get opencvContribSrc(): string {
        return path.join(this.opencvRoot, 'opencv_contrib')
    }
    get opencvContribModules(): string {
        return path.join(this.opencvContribSrc, 'modules')
    }
    get opencvBuild(): string {
        return path.join(this.opencvRoot, 'build')
    }
    get opencvInclude(): string {
        return path.join(this.opencvBuild, 'include')
    }
    get opencv4Include(): string {
        return path.join(this.opencvInclude, 'opencv4')
    }
    get opencvLibDir(): string {
        return utils.isWin() ? path.join(this.opencvBuild, 'lib/Release') : path.join(this.opencvBuild, 'lib')
    }
    get opencvBinDir(): string {
        return utils.isWin() ? path.join(this.opencvBuild, 'bin/Release') : path.join(this.opencvBuild, 'bin')
    }
    get autoBuildFile(): string {
        return path.join(this.opencvRoot, 'auto-build.json')
    }
}