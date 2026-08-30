<?php

namespace App\Http\Controllers;

use App\Models\Cdr;
use Illuminate\Http\Request;

class CdrController extends Controller
{
    public function index(Request $request)
    {
        $query = Cdr::query();

        if ($request->from) {
            $query->whereDate('created_at', '>=', $request->from);
        }

        if ($request->to) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        if ($request->caller) {
            $query->where('caller', 'LIKE', "%{$request->caller}%");
        }

        if ($request->callee) {
            $query->where('callee', 'LIKE', "%{$request->callee}%");
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        return view('admin.cdr.index', [
            'cdrs' => $query->orderBy('id', 'DESC')->get()
        ]);
    }

    public function show($id)
    {
        $cdr = Cdr::findOrFail($id);
        return view('admin.cdr.show', compact('cdr'));
    }
}
