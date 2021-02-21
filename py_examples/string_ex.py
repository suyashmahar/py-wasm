# Function to add border to a string and
# print it
def print_pattern(a: str):
    print("------")
    print(a)
    print("------")

# Declare a new string
hello_world: str = "Hello! World"
print_pattern(hello_world)

# Get the length of the string
str_len: int = len(hello_world)
print("Length:")
print(str_len)
