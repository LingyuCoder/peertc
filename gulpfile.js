var gulp = require('gulp');
var minify = require('gulp-minify');
var plumber = require('gulp-plumber');
var rename = require('gulp-rename');
var concat = require('gulp-concat');

function err(error) {
    console.error('[ERROR]: ' + error.message);
    this.emit('end');
}

gulp.task('default', function() {
    return gulp.src(['./src/*.js'])
        .pipe(plumber(err))
        .pipe(concat('peertc.js'))
        .pipe(minify({
            exclude: ['build'],
            ignoreFiles: ['-min.js']
        }))
        .pipe(rename(function(path) {
            path.basename += '-min';
        }))
        .pipe(gulp.dest('./build/'));
});

gulp.task('watch', function() {
    gulp.watch([
        './src/*.js'
    ], ['default']);
});