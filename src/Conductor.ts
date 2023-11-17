//Conductor.js

import {
	hardPush, findItem, findItemIndex, isObject, shallowEqual, deepEqual, randomID, randomString
} from "@catsums/my";

import { ProcessingTarget } from "@catsums/targetobservers";

function shuffleArray<T>(arr : T[]) {
	let array:T[] = arr.slice();
	let currentIndex = array.length,  randomIndex;
  
	// While there remain elements to shuffle.
	while (currentIndex > 0) {
		// Pick a remaining element.
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex--;
		// And swap it with the current element.
		[array[currentIndex], array[randomIndex]] = [
		array[randomIndex], array[currentIndex]];
	}
  
	return array;
}

export class Conductor extends ProcessingTarget{
	targetName = randomID('[Conductor:',']');

	bpm = 100;
	measure = 4;
	audio : HTMLMediaElement = null;

	audioContext : AudioContext = null;
	source : MediaElementAudioSourceNode = null;
	analyser : AnalyserNode = null;
	volumeControl : GainNode = null;

	musicContainer = null;

	get crotchet() {
		return 60 / this.bpm;
	}
	get stepCrotchet() {
		return this.crotchet / this.measure;
	}
	get bps() {
		return this.bpm / 60;
	}

	currStep = 1;
	lastStep = 0;
	currBeat = 1;
	lastBeat = 0;

	totalSteps = 0;
	totalBeats = 0;

	timeElapsed = 0.0;
	songPos = 0.0;
	songLength = 0.0;

	constructor(bpm = 100, measure = 4, audioElement : HTMLMediaElement = null){
		super();

		this._ready();

		this.connectElement(document.getElementsByTagName('body')[0]);
		this.audioContext = new (window.AudioContext)({ latencyHint: 'interactive' });
		this.changeStats(bpm, measure);
		this.connectAudioObject(audioElement);
		this.connectMusicContainer(new MusicContainer());
	}

	_ready(){

	}

	_process(delta:number){

	}

	_physicsProcess(delta:number){
		if(!this.audioIsConnected()) return;

		this.timeElapsed += delta;
		this.songPos = this.audio.currentTime;
		if(this.isPlaying()){
			
			var contextOutputTime = this.audioContext.getOutputTimestamp().contextTime;
			var contextProcessTime = this.audioContext.currentTime;
			this.songPos += (contextProcessTime - contextOutputTime);
			this.songPos -= (this.audioContext.baseLatency);
			this.currStep = Math.trunc(this.songPos/this.stepCrotchet);
			this.processStep();
		}
	}

	//Process Functions
	processStep = () => {
		this.songLength = this.audio?.duration;
		if(this.currStep >= this.totalSteps){
			if(this.isPlaying()){
				this.stop();
				this.songEnd();
			}
		}
		if(this.currStep > this.lastStep){
			this.stepHit();
			this.currBeat = Math.trunc(this.currStep/this.measure);
			this.lastStep = this.currStep;
		}
		if(this.currBeat > this.lastBeat){
			this.beatHit();
			this.lastBeat = this.currBeat;
			if(this.currBeat%4 == 0)
				this.barHit();
		}

	}

	//Emitting/Event Functions
	stepHit = () => {
		let data = shuffleArray(Array.from(this.frequencyData()));
		let delay = this.stepDelay();

		this.emitSignal('stepHit',{
			step: this.currStep,
			crotchet: this.crotchet,
			stepCrotchet: this.stepCrotchet,
			semibreve: this.crotchet*4,
			frequencyData:data,
			bpm:this.bpm,
			measure:this.measure,
			delay:delay,
			volume:this.getVolume(),
		});

	}
	beatHit = () => {
		let data = shuffleArray(Array.from(this.frequencyData()));
		let delay = this.stepDelay();

		this.emitSignal('beatHit',{
			beat: this.currBeat,
			crotchet: this.crotchet,
			stepCrotchet: this.stepCrotchet,
			semibreve: this.crotchet*4,
			frequencyData:data,
			bpm:this.bpm,
			measure:this.measure,
			delay:delay,
			volume:this.getVolume(),
		});
	}
	barHit = () => {
		let data = shuffleArray(Array.from(this.frequencyData()));
		let delay = this.stepDelay();

		this.emitSignal('barHit',{
			bar: Math.trunc(this.currBeat/4),
			crotchet: this.crotchet,
			stepCrotchet: this.stepCrotchet,
			semibreve: this.crotchet*4,
			frequencyData:data,
			bpm:this.bpm,
			measure:this.measure,
			delay:delay,
			volume:this.getVolume(),
		});
	}
	songEnd = () =>{
		let data = shuffleArray(Array.from(this.frequencyData()));
		let delay = this.stepDelay();

		this.emitSignal('songEnd',{
			step: this.currStep,
			beat: this.currBeat,
			bar: Math.trunc(this.currBeat/4),
			crotchet: this.crotchet,
			stepCrotchet: this.stepCrotchet,
			semibreve: this.crotchet*4,
			frequencyData:data,
			bpm:this.bpm,
			measure:this.measure,
			delay:delay,
			volume:this.getVolume(),
		});
	}

	//Change and Connection Functions
	changeStats = (bpm : number, measure : number) => {
		if(bpm<1) bpm = 1;
		if(measure<1) measure = 1;
		this.bpm = Math.round(Number(bpm));
		this.measure = Math.round(Number(measure));

		this.emitSignal('bpmChange',{
			bpm:this.bpm,
			measure:this.measure
		});
		this.connectAudioObject(this.audio);
	}

	connectMusicContainer=(container : MusicContainer)=>{
		if(container instanceof MusicContainer === false) return;

		this.connectElement(container);
		this.musicContainer = container;
		container.conductor = this;
		if(this._logs) console.log('MusicContainer Connected');
		this.emitSignal('musicContainerConnect',{
			container:container.connectId,
		});
		container.addEventListener('barHit',container.onBarHit);
		container.addEventListener('stepHit',container.onStepHit);
		container.addEventListener('beatHit',container.onBeatHit);
		container.addEventListener('bpmChange',container.onBpmChange);
	}

	connectAudioObject = (audioElement : HTMLMediaElement) => {
		if(!audioElement || typeof audioElement !== 'object' || audioElement instanceof Audio === false) return; 
		
		if(audioElement != this.audio){
			this.audio = audioElement;

			this.source = this.audioContext.createMediaElementSource(this.audio);
			this.analyser = this.audioContext.createAnalyser();
			this.volumeControl = this.audioContext.createGain();


			this.source.connect(this.volumeControl);
			this.volumeControl.connect(this.analyser);
			this.analyser.connect(this.audioContext.destination);
			
			if(this._logs) console.log('AudioElement Connected');
			this.emitSignal('audioConnect',{
				audioFile:this.audio.src
			});
		}
		this.audio = audioElement;
		this.songLength = this.audio.duration;
		this.totalSteps = Math.ceil(this.songLength * this.bps * this.measure);
		this.totalBeats = Math.ceil(this.totalSteps/this.measure);
		
		this.audio.onplay = () => {
			this.audioContext.resume();
		}
		this.audio.onpause = () => {
			this.audioContext.suspend();
		}
		this.audio.ontimeupdate = ()=>{
			
		};
		this.audio.ondurationchange = () =>{
			this.songLength = this.audio.duration;
			this.totalSteps = Math.ceil(this.songLength * this.bps * this.measure);
			this.totalBeats = Math.ceil(this.totalSteps/this.measure);
			this.resetConductor();
		};
		this.audio.onseeking = () => {

		}
		this.audio.onseeked = () => {

		}
		/*this.source = this.audioContext.createMediaElementSource(this.audio);
		this.source.connect(this.audioContext.destination);
		console.log('AudioElement Connected');
		this.emitSignal('audioConnect',{
			audioFile:this.audio.src
		});*/
	}

	resetConductor = () => {
		this.currStep = 1;
		this.lastStep = 0;
		this.currBeat = 1;
		this.lastBeat = 0;
		this.timeElapsed = 0;
		this.songPos = 0;
	}

	resetBeat = () => {
		this.lastStep = 0;
		this.lastBeat = 0;
	}

	//Playing functions
	playOn = () => {
		this.playFromStep(this.currStep);
	}
	pause = () => {
		if(this.audioIsConnected()){
			this.audioContext.suspend();
			if(!this.audio.paused){
				this.audio.pause();
			}
		}
	}
	stop = () => {
		if(this.audioIsConnected())
			this.audio.currentTime = 0;
		this.pause();
		this.resetConductor();
	}
	setStep = (step : number) => {
		if(step<0 || isNaN(step)) step = 0;
		if(this.audioIsConnected()){
			this.audio.currentTime = (step * this.stepCrotchet);
		}
		this.currStep = step;
		this.currBeat = Math.trunc(this.currStep/this.measure);
		this.resetBeat();
		this.emitSignal('stepChange');
	}
	setBeat = (beat : number) => {
		this.setStep(beat * this.measure);
	}

	playFromStep = (step : number) => {
		if(!this.audioIsConnected()) return;
		
		this.audioContext.resume();
		if(this.audio.paused){
			this.audio.play();
		}
		this.setStep(step);
	}
	playFromBeat = (beat : number) => {
		this.playFromStep(beat * this.measure);
	}
	mute = () =>{
		if(!this.volumeControl) return;
		this.volumeControl.gain.value = 0;
		// console.log(this.volumeControl.gain.value);
	}
	unmute = () =>{
		if(!this.volumeControl) return;
		this.volumeControl.gain.value = 1;
		// console.log(this.volumeControl.gain.value);
	}
	isMuted = () =>{
		if(this.getVolume()<=0){
			return true;
		}
		return false;
	}
	setVolume = (val : number) =>{
		if(val<0 || isNaN(val)) return;
		if(this.volumeControl){
			this.volumeControl.gain.value = val;
		}
	}
	getVolume = () =>{
		if(this.volumeControl){
			return this.volumeControl.gain.value;
		}
	}
	//Checkers
	frequencyData = () =>{
		let data = new Uint8Array();
		if(this.analyser){
			data = new Uint8Array(this.analyser.frequencyBinCount);
			this.analyser.getByteFrequencyData(data);
		}
		return data;
	}
	stepDelay=()=>{
		return (this.audio.currentTime-(this.currStep*this.stepCrotchet));
	}
	audioIsConnected = () => {
		if(this.audio && typeof this.audio === 'object' && this.audio instanceof Audio)
			return true;
		return false;
	}
	isPlaying = () => {
		if(!this.audio?.paused) return true;
		return false;
	}
};

export class MusicContainer extends ProcessingTarget{
	targetName = randomID('[MusicContainer:',']');
	steps : MusicNoteCollection[] = [];
	slots : { [key : string] : MusicNoteCollection } = {};
	bpm : number = null; measure : number = null;
	conductor : Conductor = null;

	public constructor(conductor? : Conductor, steps? : any[]);

	constructor(conductor : Conductor,steps=[]){
		super();
		this.conductor = (conductor instanceof Conductor) ? conductor : null;
		this.slots = {};
		if(this.conductor){
			this.steps = new Array(conductor.totalSteps);
			if(steps instanceof Array && steps[0] instanceof Object){
				this.setSteps(steps)
			}
			this.syncConductor();
		}
		
	}
	setSteps=(steps)=>{
		if(this.conductor){
			if(steps instanceof Array && steps[0] instanceof Object){
				for(let coll of steps){
					if(!coll.step) continue;
					this.addSlot(coll);
				}
			}else if(steps instanceof Object){
				for(let collID of Object.keys(steps)){
					let coll = steps[collID];
					if(!coll.step) continue;
					this.addSlot(coll);
				}
			}
			this.updateSlots();
			this.syncConductor();
		}
	}
	getNotes=(index)=>{
		if(index<0||index>=this.conductor.totalSteps) return null;
		return this.steps[index];
	}
	getSlot=(id)=>{
		if(typeof id === 'string'){
			return this.slots[id]||null;
		}
		if(typeof id === 'number'){
			return (id>=0 && id<this.conductor.totalSteps)?this.steps[id]:null;
		}
	}
	getNote=(index,noteName)=>{
		let coll = this.getNotes(index);
		if(coll && coll instanceof MusicNoteCollection){
			return coll.getNote(noteName);
		}
		return null;
	}
	updateSlots(){
		for(let slotID of Object.keys(this.slots)){
			let coll = this.slots[slotID];
			if(!coll || !(coll instanceof MusicNoteCollection)){
				this.steps[coll.step] = null;
				delete this.slots[slotID];
				// console.log('No coll here');
				continue;
			}else{
				this.setNext(coll);
			}
		}
	}
	setNext(coll : IMusicNoteCollection){
		if(!(coll instanceof MusicNoteCollection)){
			// console.log('Not valid MusicNoteCollection');
			return;
		}
		if(!this.slots[coll.id]){
			// console.log('Not available in Container');
			return;
		}
		let _next = null;
		for(let slotID of Object.keys(this.slots)){
			let initColl = this.slots[slotID];
			if(initColl && initColl.step > coll.step){
				if(!_next || _next.step > initColl.step){
					_next = initColl;
				}
			}
		}
		if(!_next){
			// console.log('No next available')
		}else{
			// console.log(`Next set: ${_next.id}`)
		}
		coll.next = _next;
	}
	addSlot=(coll : IMusicNoteCollection | number)=>{
		let newColl : MusicNoteCollection = null;
		if(coll instanceof MusicNoteCollection){
			newColl = coll;
			// console.log('initSlot is MusicNoteCollection');
		}else if(coll instanceof Object){
			newColl = new MusicNoteCollection(coll);
			
			// console.log('initSlot is Object');

		}else if(typeof coll === 'number'){
			if(coll<0||coll>=this.conductor.totalSteps) return false;

			newColl = new MusicNoteCollection({
				step:coll, delay:0.0, notes:null, targets:[]
			});
			
			// console.log('initSlot is number');
			
		}else{
			return false;
		}
		
		this.steps[newColl.step] = newColl;
		this.slots[newColl.id] = newColl;
		this.updateSlots();
		
		return true;
		// console.log('initSlot INVALID');
	}
	removeSlot=(coll : IMusicNoteCollection | number)=>{
		let initColl : MusicNoteCollection = null;
		if(coll instanceof MusicNoteCollection){
			initColl = coll;
		}else if(coll instanceof Object){
			initColl = this.slots[coll.id];
		}else if(typeof coll === 'number'){
			if(coll<0||coll>=this.conductor.totalSteps) return false;
			initColl = this.steps[coll];
		}

		if(initColl){
			this.steps[initColl.step] = null;
			delete this.slots[initColl.id];
			this.updateSlots();
			return true;
		}
		return false;
	}
	addNote=(index : number , note : IMusicNote | string)=>{
		if(index<0||index>=this.conductor.totalSteps) return false;

		let coll = this.steps[index];
		if(!coll || !(coll instanceof MusicNoteCollection)){
			if(this.addSlot(index)){
				coll = this.steps[index];
			}
		}

		let _note : MusicNote = null;
		if(typeof note === 'string'){
			_note = new MusicNote({
				note:note, step: coll.step, targets: coll.targets,
				next:null, intensity:1,
			});
		}else if(note instanceof MusicNote){
			_note = note;
		}else if(note instanceof Object){
			_note = new MusicNote(note);
		}

		if(_note && coll){
			if(coll.addNote(_note)){
				this.updateSlots();
				// console.log('note is VALID');
				return true;
			}
			// console.log('note INVALID');
			return false;
		}
		// console.log('coll INVALID');
		return false;
	}
	removeNote=(index : number, note : MusicNote | string )=>{
		if(index<0||index>=this.conductor.totalSteps) return false;

		let _note : MusicNote;
		if(!(this.steps[index])) return false;

		let coll = this.steps[index];
		if(!coll) return false;

		if(typeof note === 'string'){
			_note = coll.notes[note];
		}else if(note instanceof MusicNote){
			_note = coll.notes[note.note];
		}

		if(_note && coll){
			if(coll.removeNote(_note)){
				if(!coll.notes || !Object.keys(coll.notes).length){
					this.removeSlot(coll);
					// console.log('No notes in coll');
				}
				this.updateSlots();
				return true;
			}
		}
		return false;
	}
	syncConductor=()=>{
		if(this.conductor){
			this.bpm = this.conductor.bpm;
			this.measure = this.conductor.measure;
		}
		
	}
	// EVENT FUNCTIONS
	onStepHit=(event : CustomEvent)=>{
		let currStep = event.detail?.step||null;
		if(currStep===null) return;

		let coll = this.getSlot(currStep);
		if(!coll) return;
		coll.delay = event.detail.delay;
		coll.step = currStep;
		this.emitSignal(`noteHit`,{
			// notes: coll.asJSON(),
			notes: coll,
			step: currStep,
			crotchet: event.detail.crotchet,
			stepCrotchet: event.detail.stepCrotchet,
			semibreve: event.detail.semibreve,
			frequencyData:event.detail.data,
			bpm:event.detail.bpm,
			measure:event.detail.measure,
			delay:event.detail.delay,
		});
	}
	onBeatHit=(event : CustomEvent)=>{
		let currBeat = event.detail?.beat||null;
		if(currBeat===null) return;
		let currStep = (currBeat*this.conductor.measure);
		let coll = this.getSlot(currStep);

		if(!coll) return;
		coll.delay = event.detail.delay;
		coll.step = currStep;
		this.emitSignal(`noteBeatHit`,{
			// notes: coll.asJSON(),
			notes: coll,
			step: currStep,
			beat: currBeat,
			crotchet: event.detail.crotchet,
			stepCrotchet: event.detail.stepCrotchet,
			semibreve: event.detail.semibreve,
			frequencyData:event.detail.data,
			bpm:event.detail.bpm,
			measure:event.detail.measure,
			delay:event.detail.delay,
		});
	}
	onBarHit=(event : CustomEvent)=>{
		let currBar = event.detail?.bar||null;
		if(currBar===null) return;
		let currStep = (currBar*this.conductor.measure*4)

		let coll = this.getSlot(currStep);
		if(!coll) return;
		coll.delay = event.detail.delay;
		coll.step = currStep;
		this.emitSignal(`noteBarHit`,{
			// notes: coll.asJSON(),
			notes: coll,
			bar: currBar,
			step: currStep,
			crotchet: event.detail.crotchet,
			stepCrotchet: event.detail.stepCrotchet,
			semibreve: event.detail.semibreve,
			frequencyData:event.detail.data,
			bpm:event.detail.bpm,
			measure:event.detail.measure,
			delay:event.detail.delay,
		});
	}
	onBpmChange=(event : CustomEvent)=>{
		let totalSteps = Math.ceil(this.conductor.songLength * this.conductor.bps * this.conductor.measure);
		let newSteps = [];
		let bpmRatio = (this.conductor.bpm/this.bpm);
		let measureRatio = (this.conductor.measure/this.measure);
		this.steps.forEach((item,index)=>{
			let newStep = Math.trunc(bpmRatio*measureRatio*index);
			newSteps[newStep] = item;
		});
		this.steps = newSteps;
		this.syncConductor();
	}
	//other
	asJSON=()=>{
		let obj = {
			name: this.targetName,
			slots: {},
		};
		for(let slotID of Object.keys(this.slots)){
			let coll = this.slots[slotID];
			obj.slots[slotID] = coll.asJSON();
		}
		return obj as Object;
	}
};

interface IMusicNoteCollection {
	id?:string, step?:number, 
	delay?:number, targets?:Array<MusicNote>,
	next?:MusicNoteCollection|string, notes?:{ [key:string] : IMusicNote },
}

export class MusicNoteCollection implements IMusicNoteCollection{
	id = '';
	step = 0;
	delay = 0.0;
	targets = [];
	notes : { [key : string] : MusicNote} = {};
	next : MusicNoteCollection | string = null;

	public constructor(opts : IMusicNoteCollection);

	constructor({
		id = randomID('MNoteCollection-','',9),
		step = 0, delay = 0, notes = {},
		targets = [], next = null, 
	}){
		this.id = id;
		this.step = step;
		this.delay = delay;
		this.notes = notes;
		this.targets = targets;
		if(next instanceof MusicNoteCollection){
			this.next = next;
		}else if (typeof next === 'string') {
			this.next = next;
		}
		if(notes instanceof Object){
			for(let noteName of Object.keys(notes)){
				if(notes[noteName] instanceof MusicNote){
					this.addNote(notes[noteName]);
				}
				if(notes[noteName] instanceof Object){
					this.addNote(new MusicNote(notes[noteName]));
				}
			}
		}
	}
	addNote=(note:string | MusicNote)=>{
		if(typeof note === 'string'){
			let _note = new MusicNote({
				note:note, step:this.step, targets:this.targets,
				next:null, intensity:1,
			});
			this.notes[note] = _note;
			_note.step = this.step;
			// console.log('note is string');
			return true;
		}else if(note instanceof MusicNote){
			this.notes[note.note] = note;
			note.step = this.step;
			// console.log('note is MusicNote');
			return true;
		}
		// console.log('note WACK');
		return false;
	}
	removeNote=(note:string|MusicNote)=>{
		if(typeof note === 'string'){
			if(this.notes[note]){
				delete this.notes[note];
				return true;
			}
		}else if(note instanceof MusicNote){
			if(this.notes[note.note]){
				delete this.notes[note.note];
				return true;
			}
		}
		return false;
	}
	getNote=(noteName:string)=>{
		if(this.notes[noteName]){
			return this.notes[noteName];
		}
		return null;
	}

	toString=()=>{
		return JSON.stringify(this.asJSON());
	}

	asJSON=()=>{
		let obj:IMusicNoteCollection = {
			id:this.id, step:this.step,
			delay:this.delay,targets:this.targets,
			next: null,
			notes:{}
		};
		if(this.next instanceof MusicNoteCollection)
			obj.next = this.next.id;
		else if(typeof this.next === 'string')
			obj.next = this.next;

		for(let noteName of Object.keys(this.notes)){
			if(this.notes[noteName] instanceof MusicNote){
				obj.notes[noteName] = this.notes[noteName].asJSON();
			}
		}
		return obj as Object;
	}
};

interface IMusicNote {
	id?:string; step?:number; note?:string;
	targets?:string[]; intensity?:number;
	next?:MusicNote|string; detail?:Object;
}

export class MusicNote implements IMusicNote{
	id = '';
	step = 0;
	next : MusicNote|string = null;
	note = 'beat';
	targets = [];
	intensity = 0.0;
	detail = {};

	public constructor(opts : IMusicNote);

	constructor({
		id = randomID('MNote-','',9), step = 0,
		note = 'beat', targets = [], detail = {},
		intensity = 0, next = null,
	}){
		this.id = id;
		this.step = step;
		this.note = note;
		this.targets = targets;
		this.detail = detail;
		this.intensity = intensity;
		if(next instanceof MusicNote){
			this.next = next;
		}else if (typeof next === 'string') {
			this.next = next;
		}
	}

	toString=()=>{
		return JSON.stringify(this.asJSON());
	}

	asJSON=()=>{
		let obj = {
			id:this.id, step:this.step,
			note:this.note, targets:this.targets,
			next: null,
			intensity:this.intensity,
			detail:JSON.parse(JSON.stringify(this.detail))
		};

		if(this.next instanceof MusicNote){
			obj.next = this.next.id;
		}else if(typeof this.next === 'string'){
			obj.next = this.next;
		}

		return obj as Object;
	}

}