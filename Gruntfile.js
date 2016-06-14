module.exports = function(grunt) {


  grunt.config.merge({
    less: {
      compile: {
        files: [
          {src: "src/codeplayer.less", dest: "dist/codeplayer.css"}
        ]
      }
    },

    watch: {
      less: {
        tasks: ['less:compile'],
        files: [
          'src/*.less'
        ]
      }
    },

    cssmin: {
      compress: {
        files: [
          {
            src: [
              'dist/codeplayer.css'
            ],
            dest: 'dist/codeplayer.min.css'
          }
        ]
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

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('default', ['less', 'cssmin', 'concat', 'uglify']);
};