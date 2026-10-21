# Dựng thư viện sevenpricing cho Windows/Linux/macOS khi có CMake:
#   cmake -S . -B build && cmake --build build --config Release
# Trên macOS/Linux dự án C# tự gọi clang++ khi build (xem SevenEleven.Core.csproj), không cần CMake.
cmake_minimum_required(VERSION 3.16)
project(sevenpricing LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
add_library(sevenpricing SHARED sevenpricing.cpp)
