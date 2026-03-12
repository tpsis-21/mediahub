const ffmpeg = require('ffmpeg-static');
const { exec } = require('child_process');
const filePath = require('path').join(__dirname, 'anexos', 'modelo-video1.mp4');
console.log(`Probing: ${filePath}`);
exec(`"${ffmpeg}" -i "${filePath}"`, (_err, _stdout, stderr) => {
  console.log(stderr);
});
