
import fs from "fs";

let _version = null;

const Settings = {
	major: false,
	minor: false,
}

process.argv.forEach(function (val, i, arr) {
	switch(val.toLowerCase()){
		case '--version': case '-v':
			_version = arr[i+1];
			break;
		case '--major': case '-mj':
			Settings.major = true;
			break;
		case '--minor': case '-mn':
			Settings.minor = true;
			break;
		default:
			break;
	}
});

fs.promises.readFile('./package.json').then((res)=>{
	return JSON.parse(res.toString());
}).then(async(res)=>{
	if(_version) res.version = _version;
	if(res.version){
		let version = res.version.split(".").map(c => Number(c));
		
		let newVersion = version.slice();
		if(!Settings.major && !Settings.minor){
			newVersion[2] += 1;
		}
		if(Settings.minor){
			newVersion[1] += 1;
			newVersion[2] = 0;
		}
		if(Settings.major){
			newVersion[0] += 1;
			newVersion[1] = 0;
			newVersion[2] = 0;
		}

		let newRes = JSON.parse(JSON.stringify(res));
		newRes.version = newVersion.join(".");

		console.log({version, newVersion})
		
		await fs.promises.writeFile('./package.json', JSON.stringify(newRes, null, 4));
		
	}
}).catch((err)=>{
	console.debug(err);
});