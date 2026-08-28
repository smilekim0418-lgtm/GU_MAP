import math

def distance(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def add_holes_to_exterior(exterior, holes):
    # exterior and holes are lists of (x,y)
    # Ensure they don't have the duplicate end point for processing
    if exterior[0] == exterior[-1]:
        exterior = exterior[:-1]
        
    for hole in holes:
        if hole[0] == hole[-1]:
            hole = hole[:-1]
            
        # Find closest pair
        min_dist = float("inf")
        best_e = 0
        best_h = 0
        for i, ep in enumerate(exterior):
            for j, hp in enumerate(hole):
                d = distance(ep, hp)
                if d < min_dist:
                    min_dist = d
                    best_e = i
                    best_h = j
                    
        # Reorder hole so it starts at best_h
        hole = hole[best_h:] + hole[:best_h]
        
        # Insert hole into exterior
        # We go from exterior[best_e], to hole[0], around the hole, back to hole[0], back to exterior[best_e]
        new_exterior = exterior[:best_e+1] + hole + [hole[0]] + exterior[best_e:]
        exterior = new_exterior
        
    # Add duplicate end point back
    exterior.append(exterior[0])
    return exterior

# Test with a simple square with a hole
ext = [(0,0), (10,0), (10,10), (0,10), (0,0)]
hole = [(4,4), (6,4), (6,6), (4,6), (4,4)]

res = add_holes_to_exterior(ext, [hole])
print(res)
