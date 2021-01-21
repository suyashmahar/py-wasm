1. Example 1: Integer overflow, python supports unbounded integers
   Solution: Add support for Java like BigNum if an overflow is
   	     expected
   Code:
   # Integer overflow
   a = pow(10, 100)
   a
   # Returns 10^100 in python, 0 in my implementation

   Example 2: Non-integral result from builtin pow
   Solution: Add support for floating points
   Code:
   # Integer overflow
   exp = 1-2
   a = pow(10, exp)
   a
   # Returns 0.1 in python, 0 in my implementation

   Example 3: Parsing negative numbers, despite the grammar supporting
   	      them
   Solution: Add support for parsing numbers that have a leading -ve
   	     sign
   Code:
   # Parse error
   a = -1
   
2. ~2-3 hours

3. "It would be easier later if you lookup some typescript array
   syntax before starting."

4. The description page had almost all of the information needed to
   complete the PA, the only time I had to search for something was
   for typescript's builtin functions.

5. No one.
