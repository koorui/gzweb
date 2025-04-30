{
  "targets": [
    {
      "target_name": "gzbridge",
      "sources": [
        "GZNode.cc",
        "GazeboInterface.cc",
        "GZNode.hh",
        "GazeboInterface.hh",
        "pb2json.cc",
        "pb2json.hh",
        "ConfigLoader.cc",
        "ConfigLoader.hh",
        "OgreMaterialParser.cc",
        "OgreMaterialParser.hh"
      ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
      'cflags_cc!': [ '-fno-rtti', '-fno-exceptions' ],
      'cflags!': [ '-fno-exceptions' ],
      "cflags_cc": [ '-std=c++17', '-Wall'],
      "conditions": [
        ['OS=="linux"', {
          'cflags': [
            '<!@(pkg-config --cflags gazebo jansson protobuf)'
          ],
          'ldflags': [
            '<!@(pkg-config --libs-only-L --libs-only-other gazebo jansson protobuf)'
          ],
          'libraries': [
            '<!@(pkg-config --libs-only-l gazebo jansson protobuf)'
          ]
        }],
        ['OS=="mac"', {
          'libraries': [
            '<!@(pkg-config --libs-only-l gazebo jansson protobuf)'
          ],
          'xcode_settings' : {
            'GCC_ENABLE_CPP_RTTI': 'YES',
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'OTHER_CFLAGS': [
              '<!@(pkg-config --cflags gazebo jansson protobuf)'
            ],
            'OTHER_CPLUSPLUSFLAGS': [
              '<!@(pkg-config --cflags gazebo jansson protobuf)'
            ],
            'OTHER_LDFLAGS': [
              '<!@(pkg-config --libs-only-L --libs-only-other  gazebo jansson protobuf)'
            ]
          }
        }]
      ]
    }
  ]
}
