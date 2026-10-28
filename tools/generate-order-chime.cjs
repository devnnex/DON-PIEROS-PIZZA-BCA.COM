// Original two-part notification: warm ascending notes with a soft bell tail.
// No external recordings or runtime audio generation are required.
const fs=require('node:fs'),path=require('node:path');
const rate=44100,duration=1.45,count=Math.ceil(rate*duration),samples=new Float64Array(count);
for(const [start,frequency,gain] of [[0,659.255,.36],[.14,830.609,.30],[.28,987.767,.28],[.43,1318.51,.25]]){
 for(let i=Math.floor(start*rate);i<count;i++){
  const t=i/rate-start,attack=Math.min(1,t/.012),tail=Math.exp(-t*6.5);
  const wave=Math.sin(2*Math.PI*frequency*t)+.18*Math.sin(2*Math.PI*frequency*2.003*t)*Math.exp(-t*5);
  samples[i]+=gain*attack*tail*wave*Math.min(1,(duration-i/rate)/.12);
 }
}
const wav=Buffer.alloc(44+count*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++)wav.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,samples[i]))*32767),44+i*2);
fs.writeFileSync(path.join(__dirname,'../sound/new-order.wav'),wav);
console.log('sound/new-order.wav: 1.45 s, original, PCM mono 44.1 kHz.');
