cmake_minimum_required(VERSION 3.20)
project(fire_producer_celix VERSION 0.1.0 LANGUAGES C)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
find_package(Celix CONFIG REQUIRED)
find_package(Threads REQUIRED)
# SQLite's official development package normally satisfies this discovery.
# An explicit header/library can be supplied on minimal build hosts.
find_path(FP_SQLITE_INCLUDE_DIR sqlite3.h)
find_library(FP_SQLITE_LIBRARY NAMES sqlite3 sqlite3.so.0)
if(NOT FP_SQLITE_INCLUDE_DIR OR NOT FP_SQLITE_LIBRARY)
    message(FATAL_ERROR "SQLite3 headers and library required (FP_SQLITE_INCLUDE_DIR, FP_SQLITE_LIBRARY)")
endif()
add_library(fp_sqlite INTERFACE)
target_include_directories(fp_sqlite INTERFACE "${FP_SQLITE_INCLUDE_DIR}")
target_link_libraries(fp_sqlite INTERFACE "${FP_SQLITE_LIBRARY}")
foreach(pair IN ITEMS "football" "captions" "authority")
    add_celix_bundle(fp_${pair}
      VERSION 0.1.0 SYMBOLIC_NAME org_fireproducer_${pair}
      NAME "Fire Producer ${pair}" FILENAME fp_${pair}
      SOURCES src/${pair}.c)
    target_include_directories(fp_${pair} PRIVATE include)
    target_compile_options(fp_${pair} PRIVATE -Wall -Wextra -Werror)
    target_link_libraries(fp_${pair} PRIVATE Celix::framework)
endforeach()
target_link_libraries(fp_authority PRIVATE fp_sqlite Threads::Threads)
find_path(FP_JANSSON_INCLUDE_DIR jansson.h)
find_library(FP_JANSSON_LIBRARY NAMES jansson)
if(FP_JANSSON_INCLUDE_DIR AND FP_JANSSON_LIBRARY)
    add_executable(fire_producerd src/producerd.c)
    target_include_directories(fire_producerd PRIVATE include "${FP_JANSSON_INCLUDE_DIR}")
    target_compile_options(fire_producerd PRIVATE -Wall -Wextra -Werror)
    target_link_libraries(fire_producerd PRIVATE Celix::framework "${FP_JANSSON_LIBRARY}")
endif()
include(CTest)
if(BUILD_TESTING)
    add_executable(fp_native_smoke tests/smoke.c)
    target_include_directories(fp_native_smoke PRIVATE include)
    target_link_libraries(fp_native_smoke PRIVATE Celix::framework)
    target_compile_options(fp_native_smoke PRIVATE -Wall -Wextra -Werror)
    add_test(NAME native_authority
       COMMAND fp_native_smoke
         "${CMAKE_CURRENT_BINARY_DIR}/smoke.sqlite"
         "$<TARGET_PROPERTY:fp_football,BUNDLE_FILE>"
         "$<TARGET_PROPERTY:fp_captions,BUNDLE_FILE>"
         "$<TARGET_PROPERTY:fp_authority,BUNDLE_FILE>")
    find_program(FP_NODE_EXECUTABLE node)
    if(TARGET fire_producerd AND FP_NODE_EXECUTABLE)
        add_test(NAME native_json_socket
          COMMAND "${FP_NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/socket-smoke.mjs"
            "$<TARGET_FILE:fire_producerd>"
            "${CMAKE_CURRENT_BINARY_DIR}/fp-socket-smoke.sock"
            "${CMAKE_CURRENT_BINARY_DIR}/socket-smoke.sqlite"
            "$<TARGET_PROPERTY:fp_football,BUNDLE_FILE>"
            "$<TARGET_PROPERTY:fp_captions,BUNDLE_FILE>"
            "$<TARGET_PROPERTY:fp_authority,BUNDLE_FILE>")
        set_tests_properties(native_json_socket PROPERTIES TIMEOUT 20)
    endif()
endif()
