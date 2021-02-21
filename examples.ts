// -*- mode: typescript; typescript-indent-level: 2; -*-

export var stringEx: string = `def print_pattern(a: str):
    print("------")
    print(a)
    print("------")
    
hello_world: str = "Hello! World"
print_pattern(hello_world)`;

export var complexNumberEx: string = `class ComplexNumber:
    real: int = 0
    img: int = 0


    def new(self: ComplexNumber, real: int, img: int) -> ComplexNumber:
        self.real = real
        self.img = img
        
        return self

    def getReal(self: ComplexNumber) -> int:
        return self.real

    def getImg(self: ComplexNumber) -> int:
        return self.img

    def add(self: ComplexNumber, other: ComplexNumber) -> ComplexNumber:
        return ComplexNumber().new(self.getReal() + other.getReal(), self.getImg() + other.getImg())

    def sub(self: ComplexNumber, other: ComplexNumber) -> ComplexNumber:
        return ComplexNumber().new(self.getReal() - other.getReal(), self.getImg() - other.getImg())
    
    def mult(self: ComplexNumber, other: ComplexNumber) -> ComplexNumber:
        return ComplexNumber().new(self.getReal() * other.getReal() + self.getImg() * other.getImg(), self.getReal() * other.getImg() + self.getImg() * other.getReal())

    def magnitude(self: ComplexNumber) -> int:
        return self.isqrt(self.getReal()*self.getReal() + self.getImg()*self.getImg())

    def isqrt(self: ComplexNumber, n: int) -> int:
        x: int = n
        y: int = (x + 1) // 2
        while y < x:
            x = y
            y = (x + n // x) // 2
        return x

unitReal: ComplexNumber = ComplexNumber().new(1, 0)

dummy: ComplexNumber = ComplexNumber().new(1, 1)

dummy = dummy.add(ComplexNumber().new(2, 3))
dummy = dummy.mult(unitReal)

print(dummy.magnitude() == 5)`;

export var printPatternEx: string = `def print_pattern(lines: int):
    iter: int = 1
    temp: int = 1

    while (iter < lines):
        print(temp)

        temp = temp*10 + 1
        iter = iter + 1

print_pattern(10)
`;

export var vectorEx: string = `class Vector:
    head: Vector = None
    tail: Vector = None
    val: int = 0

    def create(self: Vector, val: int) -> Vector:
        self.val = val
        return self

    def append(self: Vector, val: int) -> Vector:
        newObj: Vector = Vector()
        newObj.val = val
        
        if (self.head is None):    
            self.head = newObj

        if (self.tail is None):
            self.tail = newObj
        else:
            self.tail.head = newObj
            self.tail = newObj
        
        return self

    def print(self: Vector):
        print(self.val)

        if (not self.head is None):
            self.head.print()

head: Vector = Vector().create(1)
head.append(2).append(3).append(4)
head.append(5)

head.print()`

export var testEx: string = `a:int = 128
b:int = 12

temp1 : bool = False
temp2 : bool = not temp1

def assert_(cond:bool):
    temp:int = 0
    if not cond:
        temp = 1 // 0

def swap():
     temp: int = a

     a = b
     b = temp

def check_swap():
    a = 100
    b = 200
    
    assert_(a==100)
    assert_(b==200)

    swap()

    assert_(a==200)
    assert_(b==100)

def check_bools():
    assert_(True)
    assert_(not False)

def check_operators():
    assert_(1+1 == 2)
    assert_(1-1 == 0)
    assert_(0-1 == -1)
    assert_(1*0 == 0)
    assert_(2//2 == 1)
    assert_(5%3 == 2)
    assert_(5>0)
    assert_(5>-5)
    assert_(10<100)
    assert_(10!=1000)

def check_init():
    assert_(a == 128)
    assert_(b == 12)

def check_if():
	if temp1:
  		assert_(False)
	elif not temp2:
		assert_(False)
	elif not temp2:
		assert_(False)
	elif not temp2:
		assert_(False)
	elif not temp2:
		assert_(False)
	else:
		if not True:
			assert_(False)
		else:
			assert_(True)

print(1)

check_init()
print(2)

check_swap()
print(3)

check_bools()
print(4)

check_operators()
print(5)

check_if()
print(6)

pass`;
