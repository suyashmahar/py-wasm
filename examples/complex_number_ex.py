class ComplexNumber:
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

print(dummy.magnitude() == 5)
