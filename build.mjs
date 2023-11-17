import * as esbuild from 'esbuild';
import { umdWrapper } from "esbuild-plugin-umd-wrapper";
import npmDts from 'npm-dts';
import util from 'util';
import child_process from 'child_process';
import fs from 'fs';
import path from 'path';

const exec = util.promisify(child_process.exec);

const { Generator } = npmDts;

let entry = ['./src/*.ts'];
let outDir = './lib'

new Generator({
	entry: 'src/index.ts',
	output: 'lib/index.d.ts',
}).generate();

const Settings = {
	watch: false,
}

process.argv.forEach(function (val) {
	switch(val.toLowerCase()){
		case '--watch':
			Settings.watch = true;
			break;
		default:
			break;
	}
});

let _default = {
	entryPoints: entry,
	bundle: false,
	platform: 'neutral',
	globalName: 'ConductorJS',
	plugins: [],
	minify: false,
	keepNames: true,
}

let data = [
	{
		_id: `cjs`,
		outdir: `${outDir}/cjs`,
		platform: "node",
		format: "cjs",
	},
	{
		_id: `esm`,
		outdir: `${outDir}/esm`,
		platform: "neutral",
		format: 'esm',
	},
	{
		_id: `browser`,
		outdir: `${outDir}/browser`,
		platform: "browser",
		format: 'iife',
	},
];

async function Build(){

	// await fs.promises.rm(`${outDir}`, {recursive: true, force: true});

	if(fs.existsSync(`${outDir}`)){
		for (const file of await fs.promises.readdir(`${outDir}`)) {
			await fs.promises.rm(path.join(`${outDir}`, file), {recursive: true, force: true});
		}
	}


	let cmd = `tsc --outDir ${outDir}${Settings.watch ? ' --watch':''}`;
	await exec(cmd);

	data.forEach(function(d,i,arr){
		d = Object.assign(d, _default);

		let id = d._id;
		delete d._id;

		d.plugins.push({
			name: 'env',
			setup(build){
				build.onEnd(async(result) => {
					console.log(`> Built ${id}`);

					let cmd = `tsc --emitDeclarationOnly --outDir ${d.outdir}`;
					console.log(`> TSC Compiling ${id}`);
					await exec(cmd);
				})
			}
		});
	});

	let ctxs = data.map(async(d, i, arr)=>{
		if(Settings.watch){
			return await esbuild.context(d);
		}
		return await esbuild.build(d);
	});
	
	if(Settings.watch){
		Promise.all(ctxs).then(async(res)=>{
			await ctx.watch();
			console.log("watching...");
		});
	}
	
}

Build();