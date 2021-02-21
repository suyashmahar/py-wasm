def print_pattern(lines: int):
    iter: int = 1
    temp: int = 1

    while (iter < lines):
        print(temp)

        temp = temp*10 + 1
        iter = iter + 1

print_pattern(10)
