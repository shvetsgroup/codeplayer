module.exports = function (grunt) {
    require('load-grunt-tasks')(grunt);

    grunt.config.merge({
        sass: {
            compile: {
                files: {"dist/codeplayer.css": "src/codeplayer.scss"}
            }
        },

        autoprefixer: {
            compile: {
                files: {"dist/codeplayer.css": "dist/codeplayer.css"}
            }
        },

        watch: {
            sass: {
                tasks: ['sass:compile', 'autoprefixer:compile'],
                files: [
                    'src/*.scss'
                ]
            }
        },

        cssmin: {
            compress: {
                files: {'dist/codeplayer.min.css': 'dist/codeplayer.css'}
            }
        },

        concat: {
            options: {
                separator: ';'
            },
            dist: {
                src: [
                    'src/codeplayer.js',
                    'src/utils/syntax.js',
                    'src/actions/class.js',
                    'src/actions/popover.js',
                    'src/actions/compile.js',
                    'src/actions/indent.js',
                    'src/actions/jumpTo.js',
                    'src/actions/moveTo.js',
                    'src/actions/run.js',
                    'src/actions/select.js',
                    'src/actions/setStep.js',
                    'src/actions/type.js',
                    'src/actions/wait.js'
                ],
                dest: 'dist/codeplayer.js'
            }
        },

        uglify: {
            options: {
                mangle: true,
                compress: {
                    warnings: false
                }
            },
            compress: {
                files: [
                    {
                        src: 'dist/codeplayer.js', dest: 'dist/codeplayer.min.js'
                    }
                ]
            }
        }
    });

    grunt.registerTask('default', ['sass', 'autoprefixer', 'cssmin', 'concat', 'uglify']);
};