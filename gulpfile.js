var gulp = require('gulp')
var minify = require('gulp-minify')
var concat = require('gulp-concat')

gulp.task('min-js', function() {
    return gulp.src(['dist/**/*.js'])
        .pipe(minify({
            ext: {
                min: '.js'
            },
            ignoreFiles: ['*.pack.js']
        }))        
        .pipe(gulp.dest('dist'))
})

gulp.task('pack-js', function () {    
    return gulp.src(['dist/**/*.js',])
        .pipe(concat('lib.pack.js'))
        .pipe(gulp.dest('dist'))
})

gulp.task('minify', gulp.series('pack-js', 'min-js' ))